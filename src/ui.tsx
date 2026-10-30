import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';

export const C = { bg: '#0b1220', card: '#131c2e', text: '#f1f5f9', dim: '#94a3b8', blue: '#2563eb', red: '#dc2626', green: '#16a34a', amber: '#d97706' };

export function Btn({ label, onPress, color = C.blue, disabled }: { label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

/** Row of single-choice pills. */
export function Chips<T extends string | number>({ options, value, onChange, disabled }: { options: { label: string; value: T }[]; value: T | null; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <View style={[s.chips, disabled && { opacity: 0.5 }]}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={String(o.value)} disabled={disabled} onPress={() => onChange(o.value)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, padding: 16 },
  btn: { paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginVertical: 6 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, padding: 14, fontSize: 18, marginVertical: 6 },
  text: { color: C.text, fontSize: 16 },
  dim: { color: C.dim, fontSize: 14 },
  code: { color: C.text, fontSize: 48, fontWeight: '800', letterSpacing: 8, textAlign: 'center', marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  err: { color: '#f87171', marginVertical: 6 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#1e293b', marginRight: 8, marginBottom: 6 },
  chipOn: { backgroundColor: C.blue },
  chipText: { color: C.dim, fontSize: 14, fontWeight: '600' },
});
