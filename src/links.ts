import { WEB_BASE } from './config';

export const CODE_RE = /^[A-Z0-9_-]{3,16}$/;

/** https://host/watch?code=ABC234 */
export const watchUrl = (code: string) => `${WEB_BASE}/watch?code=${encodeURIComponent(code)}`;

export const shareMessage = (code: string, name?: string) =>
  `${name?.trim() ? `Track ${name.trim()}` : 'Track me'} live on cLocation: ${watchUrl(code)}\nCode: ${code}`;

/** Pulls the code out of our web link or the clocation:// link. Anything else -> null. */
export function parseCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const ours = url.startsWith(`${WEB_BASE}/watch`) || url.startsWith('clocation://');
  if (!ours) return null;
  const m = /[?&]code=([^&#]+)/i.exec(url);
  if (!m) return null;
  let c: string;
  try { c = decodeURIComponent(m[1]); } catch { return null; }
  c = c.trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}
