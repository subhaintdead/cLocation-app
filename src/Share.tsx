import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Share as RNShare, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { rpc } from './api';
import { ago, flush, getJSON, K, setJSON, Sharer } from './store';
import { reconcile, startSharing, stopSharing } from './task';
import { shareMessage } from './links';
import { ALERT_CHOICES } from './arrival';
import { inText, SEND_META, sendStatusOf } from './status';
import { Btn, C, Chips, s } from './ui';

type Viewer = { name: string; at: number };
type Info = {
  custom_code: string | null;
  expiry_hours: number | null;
  expires_at: number | null;
  alert_m: number;
  now: number;
  viewers: Viewer[];
};

const EXPIRY_OPTS = [
  { label: '24 h', value: 24 },
  { label: '48 h', value: 48 },
  { label: '7 days', value: 168 },
  { label: '14 days', value: 336 },
];
const DEFAULT_EXPIRY = 48;
const ALERT_OPTS = ALERT_CHOICES.map((m) => ({ label: m === 0 ? 'Off' : `${m} m`, value: m as number }));

export default function Share({ onBack }: { onBack: () => void }) {
  const [sharer, setSharer] = useState<Sharer | null>(null);
  const [name, setName] = useState('');
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [err, setErr] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const skew = useRef(0); // server clock minus phone clock

  useEffect(() => {
    (async () => {
      const sh = await getJSON<Sharer>(K.sharer);
      if (sh) { setSharer(sh); setName(sh.name); }
      setOn(await reconcile());
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!sharer) return;
    setPending(await flush());
    setLogs((await getJSON<string[]>(K.log)) ?? []);
    try {
      const i = await rpc<Info>('get_sharer', { p_code: sharer.code, p_secret: sharer.secret });
      skew.current = i.now - Date.now();
      setInfo(i);
      setViewers(i.viewers);
    } catch {
      // database not updated yet (no get_sharer): fall back to the old viewer list, hide the new settings
      try { setViewers(await rpc('get_viewers', { p_code: sharer.code, p_secret: sharer.secret })); } catch { }
    }
  }, [sharer]);

  useEffect(() => {
    if (!sharer) return;
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [sharer, refresh]);

  const start = async () => {
    setErr('');
    try {
      let sh = sharer;
      if (!sh) {
        const r = await rpc<{ code: string; secret: string }>('create_vehicle', { p_name: name.trim() });
        sh = { ...r, name: name.trim() };
        await setJSON(K.sharer, sh);
        setSharer(sh);
      }
      await startSharing();
      setOn(true);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const stop = async () => {
    await stopSharing();
    setOn(false);
    if (sharer) rpc('stop_sharing', { p_code: sharer.code, p_secret: sharer.secret }).catch(() => { });
  };

  const newCode = async () => {
    if (!sharer) return;
    try {
      const code = await rpc<string>('rotate_code', { p_code: sharer.code, p_secret: sharer.secret });
      const sh = { ...sharer, code };
      await setJSON(K.sharer, sh);
      setSharer(sh);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const setExpiry = async (hours: number | null) => {
    if (!sharer) return;
    setErr('');
    try {
      await rpc('set_expiry', { p_code: sharer.code, p_secret: sharer.secret, p_hours: hours });
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const setAlert = async (m: number) => {
    if (!sharer) return;
    setErr('');
    setInfo((i) => (i ? { ...i, alert_m: m } : i)); // instant feedback
    try {
      await rpc('set_alert', { p_code: sharer.code, p_secret: sharer.secret, p_m: m });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      refresh();
    }
  };

  // The code people should use: your custom code if you have one, otherwise the random one
  const shown = sharer ? info?.custom_code || sharer.code : '';
  const link = () => sharer && RNShare.share({ message: shareMessage(shown, sharer.name) });

  const remaining = info?.expires_at != null ? info.expires_at - (Date.now() + skew.current) : null;
  const sendMeta = SEND_META[sendStatusOf(on, pending)];

  return (
    <ScrollView>
      <Btn label="Back" color={C.card} onPress={onBack} />
      {!sharer && <TextInput style={s.input} placeholder="Label (e.g. your name)" placeholderTextColor={C.dim} value={name} onChangeText={setName} maxLength={40} />}
      {sharer && (
        <>
          <Text style={s.dim}>{sharer.name}</Text>
          <Text style={[s.code, shown.length > 8 && { fontSize: 30, letterSpacing: 3 }]} numberOfLines={1} adjustsFontSizeToFit onPress={link}>{shown}</Text>
          <Text style={[s.dim, { textAlign: 'center' }]}>
            Tap the code to share a link{info?.custom_code ? `  ·  private code ${sharer.code}` : ''}
          </Text>
        </>
      )}
      {on ? <Btn label="Stop" color={C.red} onPress={stop} /> : <Btn label="Start" color={C.green} onPress={start} />}
      {sharer && <Text style={{ color: sendMeta.color, textAlign: 'center', fontWeight: '600', marginBottom: 4 }}>{sendMeta.label}{pending > 0 ? ` (${pending})` : ''}</Text>}
      {!!err && <Text style={s.err}>{err}</Text>}
      {sharer && <Btn label="New code" color={C.card} onPress={newCode} />}

      {sharer && info && (
        <>
          <View style={s.card}>
            <View style={[s.row, { alignItems: 'center', paddingVertical: 0 }]}>
              <Text style={s.text}>code expiration</Text>
              <Switch value={info.expiry_hours != null} onValueChange={(v) => setExpiry(v ? DEFAULT_EXPIRY : null)} />
            </View>
            {info.expiry_hours != null && <Chips options={EXPIRY_OPTS} value={info.expiry_hours} onChange={setExpiry} />}
            <Text style={s.dim}>
              {remaining == null
                ? null
                : remaining > 0
                  ? `expires in ${inText(remaining)}.`
                  : 'expired. tap New code to share expiring codes again.'}
            </Text>
          </View>

          <View style={s.card}>
            <Text style={s.text}>arrival alerts</Text>
            <Chips options={ALERT_OPTS} value={info.alert_m} onChange={setAlert} />
          </View>
        </>
      )}

      {sharer && (
        <View style={{ marginTop: 16 }}>
          <Text style={s.dim}>Viewed in the last 48 h</Text>
          {viewers.map((v, i) => (
            <View key={i} style={s.row}>
              <Text style={s.text}>{v.name || 'Anonymous'}</Text>
              <Text style={s.dim}>{ago(Date.now() - v.at)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ marginTop: 16 }}>
        {logs.slice(-25).map((l, i) => (
          <Text key={i} style={[s.dim, { fontSize: 11 }]}>{l}</Text>
        ))}
      </View>
    </ScrollView>
  );
}
