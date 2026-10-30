// Recently watched codes: newest first, no duplicates, max 5. Kept on the phone only.
export type Recent = { code: string; name: string; at: number };
export const MAX_RECENT = 5;

export function pushRecent(list: Recent[], e: Recent, max = MAX_RECENT): Recent[] {
  const old = list.find((r) => r.code === e.code);
  const entry = { ...e, name: e.name || old?.name || '' }; // keep a known label if the new one is empty
  return [entry, ...list.filter((r) => r.code !== e.code)].slice(0, max);
}
export const dropRecent = (list: Recent[], code: string): Recent[] => list.filter((r) => r.code !== code);
