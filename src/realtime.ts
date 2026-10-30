import { RealtimeClient } from '@supabase/realtime-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import type { Update } from './snap';

/**
 * Listens to live updates for one vehicle (Supabase Realtime "broadcast", public topic v:<chan>).
 * The database sends them from push_points(); nothing is read from the locked tables.
 * `onState(true)` = connected; `false` = not connected (the caller keeps polling as a fallback).
 * Returns a function that closes everything.
 */
export function listen(chan: string, onUpdate: (u: Update) => void, onState: (connected: boolean) => void): () => void {
  let closed = false;
  const client = new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, { params: { apikey: SUPABASE_KEY } });
  const ch = client.channel(`v:${chan}`, { config: { broadcast: { self: false }, private: false } });
  ch.on('broadcast', { event: 'u' }, (m) => {
    if (!closed && m?.payload) onUpdate(m.payload as Update);
  }).subscribe((status) => {
    if (!closed) onState(status === 'SUBSCRIBED');
  });
  return () => {
    closed = true;
    client.removeChannel(ch).catch(() => {});
    client.disconnect().catch(() => {});
  };
}
