import { Ionicons } from '@expo/vector-icons';
import React, { useId, useState } from 'react';
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
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { useAuth } from '../lib/auth';
import { FOOD_GROUPS, FRIENDLY_RISK } from '../lib/fun';
import { clinicalStatus } from '../lib/status';
import type { RiskLevel } from '../lib/types';
import { colors, fonts, glass, radius, shadow, StatusKey, statusColor, Tone, tones, TOUCH } from '../theme';
import { AudioButton } from './AudioButton';
import { Mascot, Mood } from './Mascot';
import { Text, TextInput } from './Text';

export { Text, TextInput };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Structural emoji (section and menu markers) are drawn as soft pastel icons so every screen
 * speaks one visual language. Food, child and mascot emoji are content and stay as they are.
 */
const ICONS: Record<string, [IconName, Tone]> = {
  '🗓️': ['calendar', 'blue'], '📅': ['calendar', 'blue'], '🧠': ['bulb', 'yellow'], '🔐': ['lock-closed', 'lavender'],
  '🔒': ['lock-closed', 'lavender'], '🤒': ['thermometer', 'pink'], '🌡️': ['thermometer', 'pink'], '📸': ['camera', 'lavender'],
  '📷': ['camera', 'lavender'], '📖': ['book', 'blue'], '📚': ['book', 'blue'], '📈': ['trending-up', 'blue'],
  '💬': ['chatbubble-ellipses', 'lavender'], '👩‍🍳': ['flame', 'orange'], '🍳': ['flame', 'orange'], '🍽️': ['restaurant', 'green'],
  '🥗': ['nutrition', 'green'], '🌱': ['leaf', 'green'], '➕': ['add-circle', 'lavender'], '🤖': ['sparkles', 'lavender'],
  '🔔': ['notifications', 'orange'], '🔎': ['search', 'blue'], '🔍': ['search', 'blue'], '📏': ['resize', 'blue'],
  '📊': ['bar-chart', 'blue'], '🎁': ['gift', 'orange'], '✍️': ['create', 'green'], '📝': ['create', 'green'],
  '✅': ['checkmark-done', 'green'], '⚙️': ['settings', 'lavender'], 'ℹ️': ['information-circle', 'blue'],
  '🛡️': ['shield-checkmark', 'green'], '🛒': ['cart', 'orange'], '🚨': ['warning', 'pink'], '⚠️': ['warning', 'pink'],
  '🗺️': ['map', 'green'], '🔑': ['key', 'yellow'], '📶': ['cloud-upload', 'blue'], '📍': ['location', 'pink'],
  '📄': ['document-text', 'blue'], '📋': ['clipboard', 'lavender'], '👩‍⚕️': ['medkit', 'pink'], '🩺': ['medkit', 'pink'],
  '👤': ['person', 'lavender'], '🏠': ['home', 'orange'], '🏅': ['ribbon', 'yellow'], '🌏': ['globe', 'blue'],
  '☁️': ['cloud', 'blue'], '🚚': ['car', 'blue'], '📦': ['cube', 'orange'], '💊': ['bandage', 'pink'],
  '🧪': ['flask', 'lavender'], '🎯': ['locate', 'orange'], '⏰': ['alarm', 'orange'], '📞': ['call', 'green'],
  '📱': ['phone-portrait', 'lavender'], '🧾': ['receipt', 'orange'], '🔄': ['sync', 'blue'], '👪': ['people', 'lavender'],
  '👥': ['people', 'lavender'], '💡': ['bulb', 'yellow'], '🤱': ['heart', 'pink'], '💉': ['medkit', 'blue'],
  '🚑': ['medical', 'pink'], '🏥': ['business', 'blue'], '🤰': ['heart-circle', 'pink'],
};
export const iconFor = (emoji?: string): IconName | undefined => (emoji ? ICONS[emoji.trim()]?.[0] : undefined);
const toneFor = (emoji?: string): Tone => (emoji ? ICONS[emoji.trim()]?.[1] : undefined) ?? 'lavender';

/** Id for SVG defs: unique per component instance so gradients never clash on the web. */
function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

/** Diagonal two-colour gradient that fills its (rounded, overflow-hidden) parent. */
export function Gradient({ from, to, r = 0 }: { from: string; to: string; r?: number }) {
  const id = useSvgId('grad');
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={r} ry={r} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Soft watercolour washes (peach, mint, lavender) behind the top of a screen. */
export function Wash({ height = 340, colorsList = ['#FFE2CF', '#D9F2E6', '#E4DEFF'], fadeTop }: { height?: number; colorsList?: string[]; fadeTop?: boolean }) {
  const id = useSvgId('wash');
  const spots = [
    { cx: '6%', cy: '6%', r: '66%' },
    { cx: '98%', cy: '14%', r: '60%' },
    { cx: '50%', cy: '78%', r: '60%' },
  ];
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0 }} width="100%" height={height} pointerEvents="none">
      <Defs>
        {spots.map((s, i) => (
          <RadialGradient key={i} id={`${id}${i}`} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} fx={s.cx} fy={s.cy}>
            <Stop offset="0" stopColor={colorsList[i % colorsList.length]} stopOpacity={0.95} />
            <Stop offset="1" stopColor={colorsList[i % colorsList.length]} stopOpacity={0} />
          </RadialGradient>
        ))}
        {/* Under a header: blend in from the page colour so there is no hard edge. */}
        <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.bg} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {spots.map((_, i) => (
        <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#${id}${i})`} />
      ))}
      {fadeTop && <Rect x="0" y="0" width="100%" height={Math.round(height * 0.35)} fill={`url(#${id}f)`} />}
    </Svg>
  );
}

/** "NutriSense" in a warm orange gradient. */
export function Wordmark({ size = 34 }: { size?: number }) {
  const id = useSvgId('word');
  const w = size * 6.1;
  return (
    <Svg width={w} height={size * 1.3} accessibilityLabel="NutriSense">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FF9F43" />
          <Stop offset="1" stopColor="#F25C2A" />
        </LinearGradient>
      </Defs>
      <SvgText x={w / 2} y={size * 1.02} fontSize={size} fontFamily={fonts.extrabold} fill={`url(#${id})`} textAnchor="middle">
        NutriSense
      </SvgText>
    </Svg>
  );
}

/**
 * Icon in a soft pastel circle (or rounded square), or a gradient square with a white icon for
 * the big feature cards. Emoji without a mapped icon (food, children) are shown as they are.
 */
export function IconChip({
  emoji,
  icon,
  size = 44,
  tone,
  gradient,
  square,
  fg,
  bg,
}: {
  emoji?: string;
  icon?: IconName;
  size?: number;
  tone?: Tone;
  gradient?: boolean;
  square?: boolean;
  fg?: string;
  bg?: string;
}) {
  const name = icon ?? iconFor(emoji);
  const t = tones[tone ?? toneFor(emoji)];
  const r = square || gradient ? size * 0.32 : size / 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: bg ?? (gradient ? t.to : t.bg),
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {gradient && <Gradient from={t.from} to={t.to} r={r} />}
      {name ? (
        <Ionicons name={name} size={Math.round(size * 0.5)} color={fg ?? (gradient ? '#fff' : t.fg)} />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.5) }}>{emoji}</Text>
      )}
    </View>
  );
}

/** Small uppercase label: section eyebrows and step counters. */
export function Eyebrow({ children, color = colors.primary, style }: { children: React.ReactNode; color?: string; style?: object }) {
  return <Text style={[{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, color, textTransform: 'uppercase' }, style]}>{children}</Text>;
}

/** Numbered step circles joined by a line: where you are in a short flow (the label is read aloud, not shown). */
export function StepDots({ total, current, label }: { total: number; current: number; label?: string }) {
  return (
    <View style={{ marginBottom: 20 }} accessible accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {Array.from({ length: total }, (_, i) => {
          const done = i < current;
          const on = i === current;
          return (
            <React.Fragment key={i}>
              {i > 0 && <View style={{ flex: 1, height: 2, marginHorizontal: 6, backgroundColor: i <= current ? colors.primary : '#E4E0F3' }} />}
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? colors.primary : done ? colors.primarySoft : '#fff',
                  borderWidth: on || done ? 0 : 1.5,
                  borderColor: '#DCD6F5',
                }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={17} color={colors.primary} />
                ) : (
                  <Text style={{ fontWeight: '700', fontSize: 14, color: on ? '#fff' : colors.muted }}>{i + 1}</Text>
                )}
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

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
      <Wash height={300} fadeTop />
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        {emoji ? <IconChip emoji={emoji} size={34} /> : null}
        <Text style={styles.h2}>{children}</Text>
      </View>
      {right}
    </View>
  );
}

export function P({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[styles.p, muted && { color: colors.muted }, style]}>{children}</Text>;
}

const BUTTONS = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary, grad: [colors.primaryLight, colors.primary] },
  mint: { bg: colors.mint, fg: '#fff', border: colors.mint, grad: ['#3FBF85', colors.mint] },
  danger: { bg: colors.danger, fg: '#fff', border: colors.danger, grad: ['#EC6A7A', colors.danger] },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft, grad: null },
  ghost: { bg: '#fff', fg: colors.primaryDark, border: '#DCD6F5', grad: null },
} as const;

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
  const p = BUTTONS[variant];
  return (
    <PressScale
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        small ? styles.buttonSmall : {},
        p.grad && !disabled ? shadow : {},
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : 1 },
      ]}
    >
      {p.grad && <Gradient from={p.grad[0]} to={p.grad[1]} />}
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Ionicons name={icon} size={small ? 18 : 21} color={p.fg} />}
          <Text style={[styles.buttonText, small && { fontSize: 15 }, { color: p.fg }]}>{title}</Text>
        </View>
      )}
    </PressScale>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor="#A09CB5"
        accessibilityLabel={label}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null]}
      />
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700', marginTop: 4 }}>⚠️ {error}</Text>
      ) : hint ? (
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Password input with a show/hide eye button (big enough to tap). */
export function PasswordField({ label, hint, error, showLabel, hideLabel, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null; showLabel: string; hideLabel: string }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor="#A09CB5"
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          secureTextEntry={!show}
          style={[styles.input, { paddingRight: 52 }, error ? { borderColor: colors.danger } : null]}
        />
        <Pressable
          onPress={() => setShow(!show)}
          accessibilityRole="button"
          accessibilityLabel={show ? hideLabel : showLabel}
          style={{ position: 'absolute', right: 4, width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
        </Pressable>
      </View>
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700', marginTop: 4 }}>⚠️ {error}</Text>
      ) : hint ? (
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.p, { flex: 1, marginRight: 8 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} trackColor={{ true: colors.primary, false: '#DAD6EA' }} thumbColor="#fff" />
    </View>
  );
}

export function Chip({ label, selected, onPress, tone, emoji }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'danger'; emoji?: string }) {
  const on = tone === 'danger' ? { bg: colors.dangerSoft, border: colors.danger, fg: colors.danger } : { bg: colors.primarySoft, border: colors.primary, fg: colors.primaryDark };
  return (
    <PressScale onPress={onPress} style={[styles.chip, { backgroundColor: selected ? on.bg : '#fff', borderColor: selected ? on.border : '#E4E0F3' }]}>
      <Text style={{ color: selected ? on.fg : colors.text, fontSize: 14, fontWeight: selected ? '700' : '500' }}>
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
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === o.value }}
          style={[styles.segmentItem, value === o.value && styles.segmentActive]}
        >
          <Text style={{ color: value === o.value ? colors.primaryDark : colors.muted, fontWeight: value === o.value ? '800' : '600', textAlign: 'center' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Caregivers see warm wording ("🟢 Tumbuh baik"); staff see the clinical risk label. Dot + text + colour. */
export function RiskBadge({ level, large, clinical }: { level: RiskLevel | null | undefined; large?: boolean; clinical?: boolean }) {
  const { t, lang, user } = useAuth();
  if (!level) return <StatusPill status="unknown" label={t('notAssessed')} large={large} />;
  const friendly = !clinical && user?.role === 'caregiver';
  if (friendly) {
    const key = level === 'low' ? 'ok' : level === 'medium' ? 'monitor' : 'action';
    return <StatusPill status={key} label={FRIENDLY_RISK[level][lang]} large={large} />;
  }
  return <StatusPill status={clinicalStatus(level)} label={t(`risk_${level}`)} large={large} />;
}

/** The status marker on its own: a coloured dot. */
export function StatusMark({ status, size = 8 }: { status: StatusKey; size?: number }) {
  const c = statusColor[status].mark;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, shadowColor: c, shadowOpacity: 0.7, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />;
}

/** "Lihat detail →" style link: the way into detail on demand. */
export function MoreLink({ label, onPress, open, center }: { label: string; onPress: () => void; open?: boolean; center?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={open === undefined ? undefined : { expanded: open }} style={{ minHeight: 44, justifyContent: 'center', alignSelf: center ? 'center' : 'flex-start' }}>
      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
        {label} {open === undefined ? '→' : open ? '↑' : '→'}
      </Text>
    </Pressable>
  );
}

/** Section title outside a card: short, with whitespace instead of a box. */
export function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 10 }}>
      <Text style={{ fontSize: 16, fontWeight: '800' }}>{title}</Text>
      {right}
    </View>
  );
}

/** Semantic status: a dot + text label in a soft pill, never colour alone. */
export function StatusPill({ status, label, large }: { status: StatusKey; label: string; large?: boolean }) {
  const c = statusColor[status];
  return (
    <View
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: c.bg, flexDirection: 'row', alignItems: 'center', gap: 6 }, large && { paddingHorizontal: 14, paddingVertical: 7 }]}
    >
      <StatusMark status={status} size={large ? 9 : 8} />
      <Text style={{ color: c.fg, fontWeight: '700', fontSize: large ? 15 : 13 }}>{label}</Text>
    </View>
  );
}

/** Makes clear who is speaking: AI guidance (lavender) vs a real health worker (blue). */
export function SourceTag({ kind }: { kind: 'ai' | 'pro' }) {
  const { t } = useAuth();
  const c = kind === 'ai' ? statusColor.ai : statusColor.info;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
      <Ionicons name={kind === 'ai' ? 'sparkles' : 'medkit'} size={13} color={c.fg} />
      <Text style={{ color: c.fg, fontWeight: '700', fontSize: 13 }}>{kind === 'ai' ? t('aiGuidance') : t('proRecommendation')}</Text>
    </View>
  );
}

/** A tappable list row (min 56 px tall) used for secondary features inside journeys. */
export function ListRow({ emoji, title, subtitle, onPress, right }: { emoji: string; title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" style={styles.listRow}>
      <IconChip emoji={emoji} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color="#A09CB5" />}
    </PressScale>
  );
}

/** Section header that shows where the user is in the Pantau → Pahami → Perbaiki → Ikuti → Tindak lanjut journey. */
export function JourneyHeader({ step, emoji, title }: { step: string; emoji: string; title: string }) {
  return (
    <View style={{ marginTop: 10, marginBottom: 10 }}>
      <Row style={{ gap: 6 }}>
        {iconFor(emoji) ? <Ionicons name={iconFor(emoji)!} size={14} color={colors.primary} /> : <Text style={{ fontSize: 13 }}>{emoji}</Text>}
        <Eyebrow>{step}</Eyebrow>
      </Row>
      <Text style={{ fontSize: 17, fontWeight: '800', marginTop: 2 }}>{title}</Text>
    </View>
  );
}

export function Badge({ text, fg, bg, large }: { text: string; fg: string; bg: string; large?: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, large && { paddingHorizontal: 14, paddingVertical: 7 }]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: large ? 15 : 12 }}>{text}</Text>
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

/** Big pastel feature card: gradient icon square, title, short description and an arrow. */
export function Tile({
  emoji,
  title,
  subtitle,
  onPress,
  tone,
  open,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: Tone;
  /** For cards that fold open: shows a down/up chevron instead of an arrow. */
  open?: boolean;
}) {
  const t = tones[tone ?? toneFor(emoji)];
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={open === undefined ? undefined : { expanded: open }}
      style={[styles.tile, { backgroundColor: t.bg }]}
    >
      <IconChip emoji={emoji} tone={tone ?? toneFor(emoji)} gradient size={52} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      <View style={styles.tileArrow}>
        <Ionicons name={open === undefined ? 'chevron-forward' : open ? 'chevron-up' : 'chevron-down'} size={18} color={t.fg} />
      </View>
    </PressScale>
  );
}

/** Round pastel shortcut with a label underneath (home "quick actions"). */
export function QuickAction({ emoji, label, onPress, tone }: { emoji: string; label: string; onPress: () => void; tone?: Tone }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', gap: 8, minHeight: TOUCH }}>
      <IconChip emoji={emoji} tone={tone} size={54} />
      <Text style={{ fontSize: 12.5, fontWeight: '600', textAlign: 'center', lineHeight: 16 }}>{label}</Text>
    </PressScale>
  );
}

/** Nuri talking to the mother. With `audio`, a "Dengar" button reads the guidance aloud (plain text is read by default). */
export function Bubble({ children, mood = 'happy', tint = colors.card, audio }: { children: React.ReactNode; mood?: Mood; tint?: string; audio?: string | boolean }) {
  // Plain text (including "Hi {name}!" style mixes of strings) gets the app font; elements render as given.
  const parts = React.Children.toArray(children);
  const plain = parts.every((c) => typeof c === 'string' || typeof c === 'number');
  const spoken = typeof audio === 'string' ? audio : audio && plain ? parts.join('') : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 }}>
      <Mascot size={56} mood={mood} />
      <View style={[styles.bubble, tint === colors.card ? glass : { backgroundColor: tint }]}>
        {plain ? <Text style={[styles.p, { fontWeight: '600' }]}>{children}</Text> : children}
        {spoken ? (
          <View style={{ marginTop: 8 }}>
            <AudioButton text={spoken} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Where a figure comes from: "Sumber: SSGI 2024, Kemenkes RI · 2024". Every figure shows its source and year. */
export function Source({ label, year, style }: { label: string | { id: string; en: string }; year?: number | string; style?: object }) {
  const { lang } = useAuth();
  const text = typeof label === 'string' ? label : label[lang];
  return (
    <Text style={[{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 }, style]}>
      {lang === 'id' ? 'Sumber' : 'Source'}: {text}
      {year && !String(text).includes(String(year)) ? ` · ${year}` : ''}
    </Text>
  );
}

/** Eight-colour ring: each WHO food group eaten today lights up one slice. */
export function RainbowPlate({ groups, size = 76 }: { groups: string[]; size?: number }) {
  const r = size / 2;
  const inner = r * 0.62;
  const n = FOOD_GROUPS.length;
  const arc = (i: number) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.06;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.06;
    const p = (a: number, rad: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`;
    return `M${p(a0, r - 1)} A${r - 1},${r - 1} 0 0 1 ${p(a1, r - 1)} L${p(a1, inner)} A${inner},${inner} 0 0 0 ${p(a0, inner)} Z`;
  };
  const count = FOOD_GROUPS.filter((g) => groups.includes(g.key)).length;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={r} cy={r} r={inner - 2} fill="#fff" />
        {FOOD_GROUPS.map((g, i) => (
          <Path key={g.key} d={arc(i)} fill={groups.includes(g.key) ? g.color : '#EEEBF8'} />
        ))}
      </Svg>
      <Text style={{ fontWeight: '900', fontSize: size * 0.2, color: colors.text }}>{count}/8</Text>
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
      <Text style={{ color: colors.danger, fontWeight: '600', marginBottom: onRetry ? 8 : 0 }}>{message}</Text>
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
  padded: { paddingHorizontal: 18, paddingTop: 18 },
  card: { borderRadius: radius.lg, padding: 20, marginBottom: 16, ...glass },
  h1: { fontSize: 21, fontWeight: '900', color: colors.text, marginBottom: 8, letterSpacing: -0.3 },
  h2Row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 2, gap: 8 },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1, lineHeight: 22 },
  p: { fontSize: 15, color: colors.text, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginLeft: 2 },
  input: { borderWidth: 1.5, borderColor: '#E4E0F3', borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, backgroundColor: '#FFFFFF', color: colors.text },
  // Radius = half the minimum height: a pill on one line, a soft rounded box if the label wraps.
  button: { borderRadius: 27, paddingVertical: 15, paddingHorizontal: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginVertical: 6, minHeight: 54, overflow: 'hidden' },
  buttonSmall: { paddingVertical: 9, paddingHorizontal: 16, minHeight: 46, borderRadius: 23 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 16, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, minHeight: TOUCH },
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8, marginBottom: 10, minHeight: 44, justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, minHeight: 60 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(236,233,246,0.8)', borderRadius: radius.pill, padding: 4, marginBottom: 14 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 4, minHeight: 44, borderRadius: radius.pill },
  segmentActive: { backgroundColor: '#fff', ...shadow },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  stat: { flex: 1, minWidth: 96, borderRadius: radius.md, padding: 14, ...glass },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '600' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 14, marginVertical: 8 },
  barTrack: { height: 10, backgroundColor: '#EEEBF8', borderRadius: 5, overflow: 'hidden', flex: 1 },
  barFill: { height: 10, borderRadius: 5 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.lg, padding: 18, minHeight: 84, marginBottom: 14 },
  tileArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffffb3', alignItems: 'center', justifyContent: 'center' },
  bubble: { flex: 1, borderRadius: radius.lg, borderBottomLeftRadius: 6, padding: 14, marginLeft: 10, marginBottom: 6 },
});
