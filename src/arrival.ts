// Arrival alert state machine (pure, so it is easy to test).
// The alert fires once when the vehicle comes from outside the radius to inside it.
//  - the first reading never fires: opening the app with the bus already close is not an "arrival"
//  - it re-arms only after the vehicle is clearly out again (radius * 1.3 + 20 m), so GPS jitter cannot spam
//  - readings while the vehicle is not live (lost / stopped) change nothing

export type Arrival = 'unknown' | 'outside' | 'inside';
export const ALERT_CHOICES = [0, 100, 200, 500] as const;

export function nextArrival(prev: Arrival, distM: number | null, radiusM: number, live: boolean): { state: Arrival; fire: boolean } {
  if (!(radiusM > 0)) return { state: 'unknown', fire: false };
  if (distM == null || !live) return { state: prev, fire: false };
  const inside = distM <= radiusM;
  if (prev === 'unknown') return { state: inside ? 'inside' : 'outside', fire: false };
  if (prev === 'outside') return inside ? { state: 'inside', fire: true } : { state: 'outside', fire: false };
  return distM > radiusM * 1.3 + 20 ? { state: 'outside', fire: false } : { state: 'inside', fire: false };
}
