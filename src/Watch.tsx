import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { rpc } from './api';
import { ago, getJSON, K, setJSON } from './store';
import { MAP_HTML } from './mapHtml';
import { Btn, C, s } from './ui';

type Latest = { name: string; sharing: boolean; lat: number | null; lng: number | null; at: number | null; now: number; trail: number[][]; recv: number };

export default function Watch({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [live, setLive] = useState(false);
  const [d, setD] = useState<Latest | null>(null);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const web = useRef<WebView>(null);
  const vid = useRef('');

  useEffect(() => {
    (async () => {
      const v = await getJSON<{ id: string; name: string; code: string }>(K.viewer);
      if (v) { vid.current = v.id; setName(v.name); setCode(v.code); }
      else vid.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    })();
  }, []);

  useEffect(() => {
    if (!live) return;
    let dead = false;
    const poll = async () => {
      try {
        const r = await rpc<Omit<Latest, 'recv'> | null>('get_latest', { p_code: code, p_viewer: vid.current, p_name: name.trim() });
        if (dead) return;
        if (!r) { setMsg('Code not found'); setLive(false); setD(null); return; }
        setD({ ...r, recv: Date.now() });
        setMsg('');
      } catch {
        if (!dead) setMsg('Offline, retrying');
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { dead = true; clearInterval(id); };
  }, [live]);

  useEffect(() => {
    if (loaded && d?.lat != null) {
      web.current?.injectJavaScript(`update(${JSON.stringify({ lat: d.lat, lng: d.lng, trail: d.trail })});true;`);
    }
  }, [d, loaded]);

  const go = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setCode(c);
    await setJSON(K.viewer, { id: vid.current, name: name.trim(), code: c });
    setMsg(''); setD(null); setLoaded(false); setLive(true);
  };

  if (!live) {
    return (
      <View>
        <Btn label="Back" color={C.card} onPress={onBack} />
        <TextInput style={[s.input, { textAlign: 'center', letterSpacing: 4, fontSize: 24 }]} placeholder="CODE" placeholderTextColor={C.dim} autoCapitalize="characters" autoCorrect={false} maxLength={16} value={code} onChangeText={setCode} />
        <TextInput style={s.input} placeholder="Your name (optional)" placeholderTextColor={C.dim} value={name} onChangeText={setName} maxLength={30} />
        <Btn label="Watch" onPress={go} />
        {!!msg && <Text style={s.err}>{msg}</Text>}
      </View>
    );
  }

  const age = d?.at != null ? d.now - d.at + (Date.now() - d.recv) : null;
  const fresh = age != null && age < 120000;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.row}>
        <Text style={s.text} onPress={() => setLive(false)}>‹ {d?.name || code}</Text>
        <Text style={{ color: fresh ? C.green : C.amber, fontSize: 16, fontWeight: '700' }}>
          {!d ? '…' : age == null ? 'No location yet' : `Last active ${ago(age)}`}
        </Text>
      </View>
      {!!msg && <Text style={s.err}>{msg}</Text>}
      <WebView ref={web} originWhitelist={['*']} source={{ html: MAP_HTML, baseUrl: 'https://localhost/' }} javaScriptEnabled onLoadEnd={() => setLoaded(true)} style={{ flex: 1, backgroundColor: C.bg }} />
    </View>
  );
}
