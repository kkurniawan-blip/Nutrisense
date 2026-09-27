import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  PressableProps,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAuth } from '../lib/auth';
import { FOOD_GROUPS, FRIENDLY_RISK } from '../lib/fun';
import type { RiskLevel } from '../lib/types';
import { colors, radius, riskColor, shadow, tilePalette } from '../theme';
import { Mascot, Mood } from './Mascot';
import { Text, TextInput } from './Text';

export { Text, TextInput };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gently shrinks when tapped: small delight on every button and tile. */
export function PressScale({ children, style, ...props }: PressableProps & { style?: ViewStyle | ViewStyle[]; children: React.ReactNode }) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <AnimatedPressable {...props} onPressIn={() => to(0.96)} onPressOut={() => to(1)} style={[style, { transform: [{ scale }] }]}>
      {children}
    </AnimatedPressable>
  );
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
}) {
  const inner = padded ? styles.padded : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: 40 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, tint }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; tint?: string }) {
  const s = [styles.card, tint ? { backgroundColor: tint, borderColor: tint } : null, style] as ViewStyle[];
  if (onPress)
    return (
      <PressScale onPress={onPress} style={s}>
        {children}
      </PressScale>
    );
  return <View style={s}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children, right, emoji }: { children: React.ReactNode; right?: React.ReactNode; emoji?: string }) {
  return (
    <View style={styles.h2Row}>
      <Text style={styles.h2}>
        {emoji ? `${emoji}  ` : ''}
        {children}
      </Text>
      {right}
    </View>
  );
}

export function P({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[styles.p, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'mint';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
    mint: { bg: colors.mint, fg: '#fff', border: colors.mint },
    secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
    danger: { bg: colors.danger, fg: '#fff', border: colors.danger },
    ghost: { bg: '#fff', fg: colors.primaryDark, border: colors.border },
  }[variant];
  return (
    <PressScale
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, small ? styles.buttonSmall : {}, { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={palette.fg} />}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: palette.fg }]}>{title}</Text>
        </View>
      )}
    </PressScale>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput placeholderTextColor="#BCAEB6" {...props} style={[styles.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }]} />
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.p, { flex: 1, marginRight: 8 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.mint, false: '#E6D9D2' }} thumbColor="#fff" />
    </View>
  );
}

export function Chip({ label, selected, onPress, tone, emoji }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'danger'; emoji?: string }) {
  const active = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <PressScale
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? active : '#fff', borderColor: selected ? active : colors.border }]}
    >
      <Text style={{ color: selected ? '#fff' : colors.text, fontSize: 14, fontWeight: '600' }}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </PressScale>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segmentItem, value === o.value && styles.segmentActive]}>
          <Text style={{ color: value === o.value ? '#fff' : colors.muted, fontWeight: '700' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Caregivers see warm wording ("Growing well 🌱"); staff see the clinical risk label. */
export function RiskBadge({ level, large, clinical }: { level: RiskLevel | null | undefined; large?: boolean; clinical?: boolean }) {
  const { t, lang, user } = useAuth();
  if (!level) return <Badge text={t('notAssessed')} fg={colors.muted} bg="#F3ECE8" />;
  const c = riskColor[level];
  const friendly = !clinical && user?.role === 'caregiver';
  const text = friendly ? `${FRIENDLY_RISK[level].emoji} ${FRIENDLY_RISK[level][lang]}` : t(`risk_${level}`);
  return <Badge text={text} fg={c.fg} bg={c.bg} large={large} />;
}

export function Badge({ text, fg, bg, large }: { text: string; fg: string; bg: string; large?: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, large && { paddingHorizontal: 14, paddingVertical: 7 }]}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: large ? 16 : 12 }}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' | 'warn' | 'ok' }) {
  const color = tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warn : tone === 'ok' ? colors.ok : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Big colourful feature button with an emoji: the main navigation for mothers. */
export function Tile({ emoji, title, subtitle, onPress, color = 0, wide }: { emoji: string; title: string; subtitle?: string; onPress: () => void; color?: number; wide?: boolean }) {
  const p = tilePalette[color % tilePalette.length];
  return (
    <PressScale onPress={onPress} style={[styles.tile, { backgroundColor: p.bg, flexBasis: wide ? '100%' : '47%' }]}>
      <View style={styles.tileEmoji}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: p.fg, marginTop: 8 }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{subtitle}</Text> : null}
    </PressScale>
  );
}

/** Nuri talking to the mother. */
export function Bubble({ children, mood = 'happy', tint = colors.mintSoft }: { children: React.ReactNode; mood?: Mood; tint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 }}>
      <Mascot size={56} mood={mood} />
      <View style={[styles.bubble, { backgroundColor: tint }]}>
        <View style={[styles.bubbleTail, { borderRightColor: tint }]} />
        {typeof children === 'string' ? <Text style={[styles.p, { fontWeight: '600' }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** Eight-colour ring: each WHO food group eaten today lights up one slice. */
export function RainbowPlate({ groups, size = 76 }: { groups: string[]; size?: number }) {
  const r = size / 2;
  const inner = r * 0.55;
  const n = FOOD_GROUPS.length;
  const arc = (i: number) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.04;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.04;
    const p = (a: number, rad: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`;
    return `M${p(a0, r - 1)} A${r - 1},${r - 1} 0 0 1 ${p(a1, r - 1)} L${p(a1, inner)} A${inner},${inner} 0 0 0 ${p(a0, inner)} Z`;
  };
  const count = FOOD_GROUPS.filter((g) => groups.includes(g.key)).length;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={r} cy={r} r={inner - 2} fill="#fff" />
        {FOOD_GROUPS.map((g, i) => (
          <Path key={g.key} d={arc(i)} fill={groups.includes(g.key) ? g.color : '#F1E6E0'} />
        ))}
      </Svg>
      <Text style={{ fontWeight: '900', fontSize: size * 0.22, color: colors.text }}>{count}/8</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <Mascot size={72} mood="thinking" bounce />
      <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useAuth();
  return (
    <View style={styles.errorBox}>
      <Text style={{ color: colors.danger, fontWeight: '600', marginBottom: onRetry ? 8 : 0 }}>😥 {message}</Text>
      {onRetry && <Button small variant="ghost" title={t('retry')} onPress={onRetry} />}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 24 }}>
      <Mascot size={88} mood="happy" bounce />
      <Text style={[styles.p, { color: colors.muted, textAlign: 'center', marginTop: 8 }]}>{text}</Text>
    </View>
  );
}

export function Bar({ pct, color = colors.mint, warnBelow = 70 }: { pct: number; color?: string; warnBelow?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${w}%`, backgroundColor: pct < warnBelow ? colors.accent : color }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#F7ECE6', ...shadow },
  h1: { fontSize: 26, fontWeight: '900', color: colors.text, marginBottom: 8 },
  h2Row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
  p: { fontSize: 15, color: colors.text, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6, marginLeft: 4 },
  input: { borderWidth: 2, borderColor: '#F4E6DF', borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, backgroundColor: '#FFFCFA', color: colors.text },
  button: { borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginVertical: 5 },
  buttonSmall: { paddingVertical: 9, paddingHorizontal: 14 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 16, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  chip: { borderWidth: 2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  segment: { flexDirection: 'row', backgroundColor: '#F6EAE4', borderRadius: radius.pill, padding: 4, marginBottom: 14 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.primary },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  stat: { flex: 1, minWidth: 96, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, ...shadow },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '600' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 14, marginVertical: 8 },
  barTrack: { height: 12, backgroundColor: '#F4E9E3', borderRadius: 6, overflow: 'hidden', flex: 1 },
  barFill: { height: 12, borderRadius: 6 },
  tile: { borderRadius: radius.lg, padding: 14, minHeight: 118, flexGrow: 1 },
  tileEmoji: { backgroundColor: '#fff', borderRadius: 18, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bubble: { flex: 1, borderRadius: 20, padding: 14, marginLeft: 10, marginBottom: 6 },
  bubbleTail: {
    position: 'absolute',
    left: -8,
    bottom: 14,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
