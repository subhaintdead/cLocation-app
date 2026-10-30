// What a watcher sees. One place defines the statuses; the web viewer (web/watch/index.html) mirrors this file.
//
//   status     when                                                          shown as
//   ---------  ------------------------------------------------------------  --------------------------
//   live       sender is sharing and the last update is <= 2 min old         "Live"
//   lost       sender is sharing but nothing arrived for > 2 min             "Signal lost"
//              (phone offline, dead battery, tunnel...). Last place is kept.
//   stopped    sender pressed Stop. Last place is kept.                      "Stopped sharing"
//   waiting    code is valid but there is no location from the last 48 h     "Waiting for sender"
//   expired    the code's expiry time has passed                             "Code expired"
//   not_found  no such code (typo, or the sender changed it)                 "Code not found"
//
// "live" -> "lost" is time based, so clients re-evaluate every second instead of waiting for the server.

export type Status = 'live' | 'lost' | 'stopped' | 'waiting' | 'expired' | 'not_found';

export const LIVE_MS = 2 * 60 * 1000;

export type StatusInput = { expired?: boolean; sharing: boolean; at: number | null };

export function statusOf(d: StatusInput | null, ageMs: number | null): Status {
  if (!d) return 'not_found';
  if (d.expired) return 'expired';
  if (d.at == null || ageMs == null) return 'waiting';
  if (!d.sharing) return 'stopped';
  return ageMs <= LIVE_MS ? 'live' : 'lost';
}

export const STATUS_META: Record<Status, { label: string; color: string; hint: string }> = {
  live: { label: 'Live', color: '#16a34a', hint: 'Sharing now' },
  lost: { label: 'Signal lost', color: '#d97706', hint: 'Still sharing, but no update lately. Showing the last known place.' },
  stopped: { label: 'Stopped sharing', color: '#94a3b8', hint: 'The sender pressed Stop. Showing the last known place.' },
  waiting: { label: 'Waiting for sender', color: '#94a3b8', hint: 'The sender has not started sharing yet.' },
  expired: { label: 'Code expired', color: '#dc2626', hint: 'This code no longer works. Ask the sender for a new one.' },
  not_found: { label: 'Code not found', color: '#dc2626', hint: 'Check the code, or ask the sender for the current one.' },
};

/** "just now", "30 s ago", "5 min ago", "2 h 10 min ago", "3 d ago" */
export function agoShort(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** "5 min", "3 h 10 min", "2 d 2 h" (for countdowns) */
export function inText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000)); // round down: a countdown must not overstate what is left
  if (m < 1) return 'less than a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** The one-line status text shown next to the name. */
export function statusLine(st: Status, ageMs: number | null): string {
  const m = STATUS_META[st];
  if (st === 'live') return ageMs != null && ageMs >= 10000 ? `Live · ${agoShort(ageMs)}` : 'Live';
  if ((st === 'lost' || st === 'stopped') && ageMs != null) return `${m.label} · last seen ${agoShort(ageMs)}`;
  return m.label;
}

/** Sender-side status (Share screen). */
export type SendStatus = 'off' | 'sending' | 'queued';
export const sendStatusOf = (on: boolean, pending: number): SendStatus => (!on ? 'off' : pending > 0 ? 'queued' : 'sending');
export const SEND_META: Record<SendStatus, { label: string; color: string }> = {
  off: { label: 'Not sharing', color: '#94a3b8' },
  sending: { label: 'Sharing · up to date', color: '#16a34a' },
  queued: { label: 'Sharing · no signal, saving points to send later', color: '#d97706' },
};
