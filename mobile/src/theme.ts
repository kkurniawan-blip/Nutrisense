import { Platform, ViewStyle } from 'react-native';

/**
 * "Digital ikat": a clean, instrument-like interface whose colours come from the natural dyes of
 * East Nusa Tenggara's ikat weaving — tarum indigo (ink and header bands), mengkudu red (actions)
 * and kunyit turmeric (highlights) — on a cool, sunlight-readable grey.
 * Token names are kept from the first design so every screen picks up the new values.
 */
export const colors = {
  primary: '#B3372B', // mengkudu red: main actions (white text 6.2:1)
  primaryDark: '#8C2A20',
  primarySoft: '#F5E3DF',
  accent: '#D99412', // kunyit turmeric: highlights, never text on white
  accentSoft: '#FBF1D6',
  mint: '#1D7A55', // leaf: growth, success
  mintSoft: '#DDEEE5',
  lavender: '#4B4FC4', // AI
  lavenderSoft: '#E6E7FA',
  sky: '#2266B3',
  skySoft: '#E0EAF6',
  pink: '#A8456F',
  pinkSoft: '#F4E2EA',
  ink: '#161C33', // tarum indigo: text and header bands
  inkSoft: '#262E4D',
  bg: '#EDF0F4',
  card: '#FFFFFF',
  text: '#161C33',
  muted: '#545C72', // >= 5:1 on white and on bg (WCAG AA)
  border: '#D5DAE3',
  line: '#E3E7EE',
  danger: '#B42318',
  dangerSoft: '#FCE6E4',
  warn: '#9A5A00',
  warnSoft: '#FCEFD6',
  ok: '#17694A',
  okSoft: '#DDEEE5',
  info: '#2F4FB8',
  infoSoft: '#E4E9FA',
};

/**
 * Semantic status colours. Every status is ALWAYS rendered with a marker and a text label too,
 * never colour alone: green on track, yellow monitor, orange action recommended, red urgent,
 * blue information, violet AI.
 */
export const statusColor = {
  ok: { fg: '#17694A', bg: '#DDEEE5', dot: '🟢', mark: '#1D7A55' },
  monitor: { fg: '#6E4E00', bg: '#FBF1D0', dot: '🟡', mark: '#D99412' },
  action: { fg: '#9A3F07', bg: '#FCE7D6', dot: '🟠', mark: '#E0701B' },
  urgent: { fg: '#B42318', bg: '#FCE6E4', dot: '🔴', mark: '#C62B1F' },
  info: { fg: '#1E56A6', bg: '#E0EAF6', dot: 'ℹ️', mark: '#2266B3' },
  ai: { fg: '#4B4FC4', bg: '#E6E7FA', dot: '🤖', mark: '#4B4FC4' },
  unknown: { fg: '#545C72', bg: '#E9ECF2', dot: '⚪', mark: '#8A92A6' },
} as const;
export type StatusKey = keyof typeof statusColor;

export const riskColor = {
  low: { fg: '#17694A', bg: '#DDEEE5' },
  medium: { fg: '#6E4E00', bg: '#FBF1D0' },
  high: { fg: '#B42318', bg: '#FCE6E4' },
} as const;

/** Tile and recipe-card colours: calm tints with a strong foreground, one per feature. */
export const tilePalette = [
  { fg: colors.primaryDark, bg: colors.primarySoft },
  { fg: colors.ok, bg: colors.mintSoft },
  { fg: '#7A5200', bg: colors.accentSoft },
  { fg: colors.lavender, bg: colors.lavenderSoft },
  { fg: colors.sky, bg: colors.skySoft },
  { fg: colors.pink, bg: colors.pinkSoft },
];

export const fonts = {
  // Body: Plus Jakarta Sans (designed in Jakarta by Tokotype).
  regular: 'PlusJakartaSans_400Regular',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  black: 'PlusJakartaSans_800ExtraBold',
  // Display: Unbounded, for big titles and readouts only.
  display: 'Unbounded_600SemiBold',
  displayBold: 'Unbounded_700Bold',
  // Mono: step counters, units and small labels.
  mono: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_600SemiBold',
};

// 'pill' tags are squared-off on purpose: soft rectangles, not capsules.
export const radius = { sm: 8, md: 12, lg: 16, pill: 10 };

/** Panels are separated by hairlines, not soft shadows; only floating elements get a crisp shadow. */
export const shadow: ViewStyle =
  Platform.OS === 'android'
    ? { elevation: 1 }
    : { shadowColor: '#161C33', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } };

export const space = (n: number) => n * 4;

/** Minimum comfortable touch target (WCAG 2.5.5 / platform guidelines). */
export const TOUCH = 44;
