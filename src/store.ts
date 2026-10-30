import AsyncStorage from '@react-native-async-storage/async-storage';
import { rpc } from './api';

export type Sharer = { code: string; secret: string; name: string };
export type Pt = { lat: number; lng: number; t: number; spd?: number; hdg?: number };

export const K = { sharer: 'sharer', queue: 'queue', viewer: 'viewer', log: 'log', sharing: 'sharing' };

// tiny on-device log, shown on the Share screen (survives crashes)
export async function log(m: string) {
  try {
    const l = (await AsyncStorage.getItem(K.log).then((v) => (v ? JSON.parse(v) : []))) as string[];
    l.push(`${new Date().toLocaleTimeString()} ${m}`);
    await AsyncStorage.setItem(K.log, JSON.stringify(l.slice(-40)));
  } catch {}
}
let lastErr = '';

export async function getJSON<T>(k: string): Promise<T | null> {
  const v = await AsyncStorage.getItem(k);
  return v ? (JSON.parse(v) as T) : null;
}
export const setJSON = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v));

// serialise queue access
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

export const enqueue = (pts: Pt[]) =>
  locked(async () => {
    const q = (await getJSON<Pt[]>(K.queue)) ?? [];
    await setJSON(K.queue, q.concat(pts).slice(-3000));
  });

/** Sends buffered points. Returns how many are still waiting. */
export const flush = () =>
  locked(async () => {
    const s = await getJSON<Sharer>(K.sharer);
    let rest = (await getJSON<Pt[]>(K.queue)) ?? [];
    if (!s) return rest.length;
    try {
      while (rest.length) {
        const batch = rest.slice(0, 200);
        await rpc('push_points', { p_code: s.code, p_secret: s.secret, p_points: batch });
        rest = rest.slice(batch.length);
        await setJSON(K.queue, rest);
        lastErr = '';
        await log(`sent ${batch.length}`);
      }
    } catch (e: any) {
      const m = String(e?.message ?? e).slice(0, 120);
      if (m !== lastErr) { lastErr = m; await log(`send failed: ${m}`); }
    }
    return rest.length;
  });

export const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
};
