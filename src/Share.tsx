import React, { useEffect, useState } from 'react';
import { Share as RNShare, ScrollView, Text, TextInput, View } from 'react-native';
import { rpc } from './api';
import { ago, flush, getJSON, K, setJSON, Sharer } from './store';
import { reconcile, startSharing, stopSharing } from './task';
import { Btn, C, s } from './ui';

export default function Share({ onBack }: { onBack: () => void }) {
  const [sharer, setSharer] = useState<Sharer | null>(null);
  const [name, setName] = useState('');
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(0);
  const [viewers, setViewers] = useState<{ name: string; at: number }[]>([]);
  const [err, setErr] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const sh = await getJSON<Sharer>(K.sharer);
      if (sh) { setSharer(sh); setName(sh.name); }
      setOn(await reconcile());
    })();
  }, []);

  useEffect(() => {
    if (!sharer) return;
    const tick = async () => {
      setPending(await flush());
      setLogs((await getJSON<string[]>(K.log)) ?? []);
      try {
        setViewers(await rpc('get_viewers', { p_code: sharer.code, p_secret: sharer.secret }));
      } catch { }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [sharer]);

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

  return (
    <ScrollView>
      <Btn label="Back" color={C.card} onPress={onBack} />
      {!sharer && <TextInput style={s.input} placeholder="Label (e.g. your name)" placeholderTextColor={C.dim} value={name} onChangeText={setName} maxLength={40} />}
      {sharer && (
        <>
          <Text style={s.dim}>{sharer.name}</Text>
          <Text style={s.code} onPress={() => RNShare.share({ message: sharer.code })}>{sharer.code}</Text>
        </>
      )}
      {on ? <Btn label="Stop" color={C.red} onPress={stop} /> : <Btn label="Start" color={C.green} onPress={start} />}
      {!!err && <Text style={s.err}>{err}</Text>}
      {pending > 0 && <Text style={s.dim}>Waiting to send: {pending}</Text>}
      {sharer && <Btn label="New code" color={C.card} onPress={newCode} />}
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
