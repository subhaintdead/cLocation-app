import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { rpc } from './api';
import { addRecent, clearRecent, getAlertPref, getJSON, getRecent, K, removeRecent, setAlertPref, setJSON } from './store';
import type { Recent } from './recent';
import { MAP_HTML } from './mapHtml';
import { listen } from './realtime';
import { applyUpdate, fromRaw, Raw, Snap } from './snap';
import { inText, Status, statusLine, statusOf, STATUS_META } from './status';
import { distanceM, fmtDist } from './geo';
import { ALERT_CHOICES, Arrival, nextArrival } from './arrival';
import { ensureNotifyPermission, notifyArrival } from './notify';
import { CODE_RE } from './links';
import { Btn, C, Chips, s } from './ui';

const ALERT_OPTS = ALERT_CHOICES.map((m) => ({ label: m === 0 ? 'Off' : `${m} m`, value: m as number }));
const newViewerId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function Watch({ onBack, initialCode }: { onBack: () => void; initialCode?: string }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const vid = useRef('');

  useEffect(() => {
    (async () => {
      const v = await getJSON<{ id: string; name: string; code: string }>(K.viewer);
      let nm = '';
      if (v) { vid.current = v.id; nm = v.name; setName(v.name); if (!initialCode) setCode(v.code); }
      else vid.current = newViewerId();
      setRecent(await getRecent());
      if (initialCode) begin(initialCode, nm); // opened from a link: start watching right away
    })();
  }, []);

  const begin = async (raw: string, nm: string = name) => {
    const c = raw.trim().toUpperCase();
    if (!CODE_RE.test(c)) { setMsg('Enter a valid code (3-16 letters or digits)'); return; }
    if (!vid.current) vid.current = newViewerId();
    setCode(c);
    setMsg('');
    await setJSON(K.viewer, { id: vid.current, name: nm.trim(), code: c });
    setActive(c);
  };

  const exit = async (m?: string) => {
    setActive(null);
    if (m) setMsg(m);
    setRecent(await getRecent());
  };

  const del = async (c: string) => setRecent(await removeRecent(c));
  const clearAll = () =>
    Alert.alert('Clear history?', 'Removes the codes you watched recently from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await clearRecent(); setRecent([]); } },
    ]);

  if (active) return <Live key={active} code={active} vid={vid.current} viewerName={name.trim()} onExit={exit} />;

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Btn label="Back" color={C.card} onPress={onBack} />
      <TextInput style={[s.input, { textAlign: 'center', letterSpacing: 4, fontSize: 24 }]} placeholder="CODE" placeholderTextColor={C.dim} autoCapitalize="characters" autoCorrect={false} maxLength={16} value={code} onChangeText={setCode} />
      <TextInput style={s.input} placeholder="Your name (optional)" placeholderTextColor={C.dim} value={name} onChangeText={setName} maxLength={30} />
      <Btn label="Watch" onPress={() => begin(code)} />
      {!!msg && <Text style={s.err}>{msg}</Text>}
      {recent.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <View style={[s.row, { alignItems: 'center' }]}>
            <Text style={s.dim}>Recently watched</Text>
            <Text style={[s.dim, { color: C.blue }]} onPress={clearAll}>Clear all</Text>
          </View>
          {recent.map((r) => (
            <View key={r.code} style={[s.card, { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 10 }]}>
              <Pressable style={{ flex: 1 }} onPress={() => begin(r.code)}>
                <Text style={s.text} numberOfLines={1}>{r.name || r.code}</Text>
                {!!r.name && <Text style={s.dim}>{r.code}</Text>}
              </Pressable>
              <Pressable onPress={() => del(r.code)} hitSlop={12}>
                <Text style={{ color: C.dim, fontSize: 20, paddingHorizontal: 10 }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Live({ code, vid, viewerName, onExit }: { code: string; vid: string; viewerName: string; onExit: (m?: string) => void }) {
  const [d, setD] = useState<Snap | null>(null);
  const [net, setNet] = useState(true);   // last poll worked
  const [rt, setRt] = useState(false);    // realtime connected
  const [, setTick] = useState(0);        // re-render every second so "x s ago" and live -> lost stay correct
  const [loaded, setLoaded] = useState(false);
  const [showMe, setShowMe] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [pref, setPref] = useState<number | null>(null); // this phone's own alert choice (null = use the sender's default)
  const [notifOk, setNotifOk] = useState(true);
  const [locErr, setLocErr] = useState('');
  const web = useRef<WebView>(null);
  const rtRef = useRef(false);
  const expRef = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);
  const pollNow = useRef<() => void>(() => { });
  const arrival = useRef<Arrival>('unknown');
  const named = useRef(false);

  // ---- polling: the safety net. Every 5 s normally, 30 s while realtime is connected, 15 s once expired ----
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (busy.current) { again.current = true; return; }
      busy.current = true;
      if (timer) clearTimeout(timer);
      try {
        const r = await rpc<Raw | null>('get_latest', { p_code: code, p_viewer: vid, p_name: viewerName });
        if (dead) return;
        if (!r) { onExit('Code not found. The sender may have changed it.'); return; }
        setNet(true);
        const snap = fromRaw(r, Date.now());
        expRef.current = snap.expired;
        setD(snap);
        if (!named.current) { named.current = true; addRecent(code, snap.name).catch(() => { }); }
      } catch {
        if (!dead) setNet(false);
      }
      busy.current = false;
      if (dead) return;
      const wait = again.current ? 0 : expRef.current ? 15000 : rtRef.current ? 30000 : 5000;
      again.current = false;
      timer = setTimeout(run, wait);
    };
    pollNow.current = run;
    run();
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, [code]);

  // ---- realtime: instant updates pushed by the database ----
  const chan = d?.chan ?? null;
  useEffect(() => {
    if (!chan) return;
    const stop = listen(
      chan,
      (u) => { if (u.refresh) pollNow.current(); else setD((p) => (p ? applyUpdate(p, u) : p)); },
      (ok) => { rtRef.current = ok; setRt(ok); pollNow.current(); }, // resync on every connect / disconnect
    );
    return () => { stop(); rtRef.current = false; setRt(false); };
  }, [chan]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { getAlertPref(code).then(setPref).catch(() => { }); }, [code]);

  // ---- derived state ----
  const age = d?.at != null ? Math.max(0, Date.now() + d.skew - d.at) : null;
  const status: Status = statusOf(d, age);
  const meta = STATUS_META[status];
  const alertM = pref ?? d?.alertM ?? 0;
  const armed = alertM > 0 && !d?.expired;
  const needLoc = showMe || armed;
  const dist = me && d?.lat != null && d.lng != null ? distanceM(me, { lat: d.lat, lng: d.lng }) : null;

  // ---- my own location (only while "Show my location" is on or an alert is armed; never sent anywhere) ----
  useEffect(() => {
    if (!needLoc) { setMe(null); return; }
    let dead = false;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      try {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== 'granted') {
          if (!dead) { setLocErr('Location permission is needed to show you on the map or to alert you.'); setShowMe(false); }
          return;
        }
        if (!dead) setLocErr('');
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
          (l) => { if (!dead) setMe({ lat: l.coords.latitude, lng: l.coords.longitude, acc: l.coords.accuracy ?? 0 }); },
        );
        if (dead) sub.remove();
      } catch {
        if (!dead) setLocErr('Could not get your location.');
      }
    })();
    return () => { dead = true; sub?.remove(); };
  }, [needLoc]);

  // ---- arrival alerts ----
  useEffect(() => {
    if (alertM > 0) ensureNotifyPermission().then(setNotifOk);
  }, [alertM > 0]);
  useEffect(() => {
    if (!armed) return;
    activateKeepAwakeAsync('arrival').catch(() => { }); // JS must stay alive to notice the vehicle getting close
    return () => { deactivateKeepAwake('arrival').catch(() => { }); };
  }, [armed]);
  useEffect(() => { arrival.current = 'unknown'; }, [alertM]);
  useEffect(() => {
    if (!armed || dist == null || !d) return;
    const r = nextArrival(arrival.current, dist, alertM, status === 'live');
    arrival.current = r.state;
    if (r.fire) notifyArrival(`${d.name || code} is close`, `About ${fmtDist(dist)} away (your alert is set to ${alertM} m)`);
  }, [dist, alertM, status, armed]);

  // ---- map ----
  const inject = (js: string) => web.current?.injectJavaScript(`(function(){try{${js}}catch(e){}})();true;`);
  useEffect(() => {
    if (loaded && d?.lat != null) inject(`update(${JSON.stringify({ lat: d.lat, lng: d.lng, trail: d.trail })})`);
  }, [d, loaded]);
  useEffect(() => {
    if (!loaded) return;
    if (showMe && me) inject(`setMe(${JSON.stringify(me)})`);
    else inject('clearMe()');
  }, [me, showMe, loaded]);

  const choose = (m: number) => { setPref(m); setAlertPref(code, m).catch(() => { }); };

  const detail: string[] = [];
  if (showMe && dist != null) detail.push(`${fmtDist(dist)} from you`);
  if (d?.expiresAt && !d.expired) detail.push(`code expires in ${inText(d.expiresAt - (Date.now() + d.skew))}`);
  detail.push(rt ? 'realtime' : net ? 'checking every 5 s' : 'offline, retrying');

  const alertHint =
    alertM === 0
      ? 'Off. Pick a distance to get a notification when the vehicle comes that close to you.'
      : `Notifies you when it comes within ${alertM} m of you${pref === null ? " (the sender's default)" : ''}. ` +
        'Works while this screen is open, and keeps the screen on.' +
        (notifOk ? '' : ' Notifications are blocked: allow them in system settings.');

  return (
    <View style={{ flex: 1 }}>
      <View style={s.row}>
        <Text style={[s.text, { flexShrink: 1 }]} numberOfLines={1} onPress={() => onExit()}>‹ {d?.name || code}</Text>
        <Text style={{ color: meta.color, fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 8 }} numberOfLines={2}>
          {!d ? (net ? '…' : 'Offline') : statusLine(status, age)}
        </Text>
      </View>
      <Text style={[s.dim, { marginBottom: 6 }]}>{detail.join(' · ')}</Text>

      <View style={{ flex: 1 }}>
        <WebView ref={web} originWhitelist={['*']} source={{ html: MAP_HTML, baseUrl: 'https://localhost/' }} javaScriptEnabled onLoadEnd={() => setLoaded(true)} style={{ flex: 1, backgroundColor: C.bg }} />
        {status === 'expired' && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, justifyContent: 'center', padding: 24 }]}>
            <Text style={[s.text, { textAlign: 'center', fontWeight: '700', marginBottom: 6 }]}>{meta.label}</Text>
            <Text style={[s.dim, { textAlign: 'center' }]}>{meta.hint}</Text>
          </View>
        )}
      </View>
      {(status === 'lost' || status === 'stopped' || status === 'waiting') && <Text style={[s.dim, { marginTop: 6 }]}>{meta.hint}</Text>}

      <View style={s.card}>
        <View style={[s.row, { alignItems: 'center', paddingVertical: 0 }]}>
          <Text style={s.text}>Show my location</Text>
          <Switch value={showMe} onValueChange={setShowMe} />
        </View>
        {showMe && (
          <View style={[s.chips, { marginBottom: 0 }]}>
            <Pressable style={s.chip} onPress={() => inject('fitBoth()')}><Text style={s.chipText}>Fit both</Text></Pressable>
            <Pressable style={s.chip} onPress={() => inject('centerVehicle()')}><Text style={s.chipText}>Center on vehicle</Text></Pressable>
          </View>
        )}
        <Text style={[s.text, { marginTop: 10 }]}>Arrival alert</Text>
        <Chips options={ALERT_OPTS} value={alertM} onChange={choose} />
        <Text style={s.dim}>{alertHint}</Text>
        {!!locErr && <Text style={s.err}>{locErr}</Text>}
      </View>
    </View>
  );
}
