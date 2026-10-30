// What the Watch screen knows about the vehicle, and how a realtime push updates it.
export type Raw = {
  name: string; sharing?: boolean; expired?: boolean;
  lat?: number | null; lng?: number | null; at?: number | null; now: number;
  trail?: number[][]; chan?: string; alert_m?: number; expires_at?: number | null;
};
export type Snap = {
  name: string; sharing: boolean; expired: boolean;
  lat: number | null; lng: number | null; at: number | null;
  trail: number[][]; chan: string | null; alertM: number; expiresAt: number | null;
  skew: number; // server clock minus phone clock (ms): serverNow ~= Date.now() + skew
};
export type Update = { lat?: number; lng?: number; at?: number; sharing?: boolean; trail?: number[][]; refresh?: boolean };

export const fromRaw = (r: Raw, recv: number): Snap => ({
  name: r.name ?? '',
  sharing: !!r.sharing,
  expired: !!r.expired,
  lat: r.lat ?? null, lng: r.lng ?? null, at: r.at ?? null,
  trail: r.trail ?? [],
  chan: r.chan ?? null,
  alertM: r.alert_m ?? 0,
  expiresAt: r.expires_at ?? null,
  skew: r.now - recv,
});

const TRAIL_MAX = 60;
const same = (a?: number[], b?: number[]) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export function applyUpdate(s: Snap, u: Update): Snap {
  const n = { ...s };
  if (u.sharing !== undefined) n.sharing = u.sharing;
  if (u.lat != null && u.lng != null && u.at != null && (s.at == null || u.at >= s.at)) {
    n.lat = u.lat; n.lng = u.lng; n.at = u.at;
    const add = u.trail ?? [];
    // a poll may already have delivered these points: skip when the newest one is already the end of the trail
    if (add.length && !same(s.trail[s.trail.length - 1], add[add.length - 1])) n.trail = s.trail.concat(add).slice(-TRAIL_MAX);
  }
  return n;
}
