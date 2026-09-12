import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  TextInputProps, ViewStyle,
} from 'react-native';
import { C, R, SERIF } from '../theme';

/* ---------- Button ---------- */
export function Btn({
  label, onPress, variant = 'p', size = 'md', block, disabled, style, icon,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'p' | 'b' | 'o' | 'd';
  size?: 'xs' | 'sm' | 'md';
  block?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const bg = { p: C.plum, b: C.brand, o: C.white, d: C.redBg }[variant];
  const fg = { p: C.white, b: C.white, o: C.plum, d: C.red }[variant];
  const pad = { xs: [5, 10] as const, sm: [8, 13] as const, md: [12, 18] as const }[size];
  const fs = { xs: 11.5, sm: 12.5, md: 14 }[size];
  const rad = { xs: 8, sm: 10, md: 13 }[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, color: fg, paddingVertical: pad[0], paddingHorizontal: pad[1], borderRadius: rad, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        block && styles.flex1,
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={fs + 2} color={fg} style={{ marginRight: 6 }} />}
      <Text style={{ color: fg, fontSize: fs, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Chip ---------- */
export function Chip({
  children, on, mono, onPress, style,
}: {
  children: React.ReactNode;
  on?: boolean;
  mono?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const bg = on ? C.brand : mono ? C.white : C.brand50;
  const fg = on ? C.white : mono ? C.ink2 : C.brand800;
  const border = on ? C.brand : mono ? C.line2 : C.brand100;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}

/* ---------- Card ---------- */
export function Card({
  children, flush, style, onPress,
}: {
  children: React.ReactNode;
  flush?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const inner = (
    <View
      style={[
        styles.card,
        flush && { padding: 0, overflow: 'hidden' },
        onPress && { cursor: 'pointer' },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/* ---------- Form ---------- */
export function Field({ label, children, row }: { label: string; children: React.ReactNode; row?: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {row}
    </View>
  );
}
export function Inp(props: TextInputProps) {
  return <TextInput {...props} placeholderTextColor={C.ink3} style={[styles.inp, props.style]} />;
}
export function ErrBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: C.red, fontSize: 13 }}>{msg}</Text>
    </View>
  );
}

/* ---------- Segmented ---------- */
export function Seg({
  options, value, onChange, style,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.seg, style]}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segBtn, value === o.key && styles.segBtnOn]}>
          <Text style={{ color: value === o.key ? C.plum : C.ink2, fontSize: 13, fontWeight: '700' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- Status pill ---------- */
const PILL: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: C.amberBg, fg: C.amber, label: 'Pending' },
  confirmed: { bg: C.greenBg, fg: C.green, label: 'Confirmed' },
  rejected: { bg: C.redBg, fg: C.red, label: 'Declined' },
  cancelled: { bg: '#EFE9EA', fg: C.ink3, label: 'Cancelled' },
  completed: { bg: C.plum, fg: C.white, label: 'Completed' },
  no_show: { bg: C.redBg, fg: C.red, label: 'No-show' },
  verified: { bg: C.greenBg, fg: C.green, label: 'Verified' },
  unverified: { bg: '#EFE9EA', fg: C.ink3, label: 'Unverified' },
};
export function Pill({ status, label }: { status: string; label?: string }) {
  const p = PILL[status] || { bg: '#EFE9EA', fg: C.ink3, label: status };
  const L = label || p.label;
  return (
    <View style={{ backgroundColor: p.bg, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3.5, flexDirection: 'row', alignItems: 'center' }}>
      {status === 'verified' && <Ionicons name="shield-checkmark" size={12} color={p.fg} style={{ marginRight: 4 }} />}
      <Text style={{ color: p.fg, fontSize: 11, fontWeight: '700' }}>{L}</Text>
    </View>
  );
}

/* ---------- Stars ---------- */
export function Stars({ n, size = 12 }: { n: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= n ? 'star' : 'star-outline'} size={size} color={C.gold} style={{ marginRight: 1 }} />
      ))}
    </View>
  );
}
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)}>
          <Ionicons name={i <= value ? 'star' : 'star-outline'} size={38} color={i <= value ? C.gold : C.line2} />
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- Avatar ---------- */
import { AV_COLORS } from '../theme';
import { hashNum } from '../utils';
export function Avatar({ name, size = 46 }: { name: string; size?: number }) {
  const color = AV_COLORS[hashNum(name) % AV_COLORS.length];
  const init = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: C.white, fontWeight: '800', fontSize: size * 0.32 }}>{init}</Text>
    </View>
  );
}

/* ---------- misc ---------- */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontFamily: SERIF, fontSize: 16.5, color: C.plum, fontWeight: '600' }}>{title}</Text>
      {action && (
        <Pressable onPress={onAction}>
          <Text style={{ fontSize: 12.5, color: C.brand700, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}
export function Sp() {
  return <View style={{ flex: 1 }} />;
}
export function HScroll({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingRight: 16, ...style }}
    >
      {children}
    </ScrollView>
  );
}
export function Empty({ icon, title, text, action, onAction }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20 }}>
      <Ionicons name={icon} size={40} color={C.line2} />
      <Text style={{ fontFamily: SERIF, color: C.plum, fontSize: 16, marginTop: 12 }}>{title}</Text>
      <Text style={{ color: C.ink3, fontSize: 12.5, textAlign: 'center', marginTop: 4, maxWidth: 260 }}>{text}</Text>
      {action && (
        <Btn label={action} variant="p" size="sm" onPress={onAction} style={{ marginTop: 14 }} />
      )}
    </View>
  );
}
export function StatBox({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' }}>
      <Text style={{ fontFamily: SERIF, fontSize: small ? 13 : 16.5, color: C.plum, fontWeight: '700' }}>{value}</Text>
      <Text style={{ fontSize: 9.5, color: C.ink3, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
export function SwitchRow({ title, sub, value, onValueChange, tint }: { title: string; sub?: string; value: boolean; onValueChange: (v: boolean) => void; tint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, color: C.plum, fontWeight: '700' }}>{title}</Text>
        {sub && <Text style={{ fontSize: 11.5, color: C.ink3 }}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: C.line2, true: tint || C.green }} thumbColor={C.white} />
    </View>
  );
}
export function Note({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand100, borderRadius: 10, padding: 10, marginTop: 10 }, style]}>
      <Text style={{ fontSize: 11.5, color: C.ink3 }}>{children}</Text>
    </View>
  );
}
export function LRow({ icon, title, sub, right, style }: { icon?: keyof typeof Ionicons.glyphMap; title: string; sub?: string; right?: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, ...style }}>
      {icon && (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={C.brand700} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, color: C.plum, fontWeight: '700' }}>{title}</Text>
        {sub && <Text style={{ fontSize: 11.5, color: C.ink3 }} numberOfLines={1}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  flex1: { width: '100%' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5.5, borderRadius: R.pill, borderWidth: 1, alignSelf: 'flex-start' },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, shadowColor: C.plum, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  label: { fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  inp: { borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, backgroundColor: C.white, padding: 11, paddingHorizontal: 13, fontSize: 14.5, color: C.ink },
  seg: { flexDirection: 'row', backgroundColor: C.brand100, borderRadius: R.md, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segBtnOn: { backgroundColor: C.white, shadowColor: C.plum, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
