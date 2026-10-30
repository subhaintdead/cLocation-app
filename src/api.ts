import { SUPABASE_URL, SUPABASE_KEY } from './config';

export async function rpc<T = any>(fn: string, args: object): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(args),
      signal: ctl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}
