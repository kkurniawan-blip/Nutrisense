import { Platform, ViewStyle } from 'react-native';

/** Warm, soft palette designed for mothers: coral, mint, sunshine and lavender on cream. */
export const colors = {
  primary: '#EF6352',
  primaryDark: '#B8433A',
  primarySoft: '#FFE9E3',
  accent: '#FFB938',
  accentSoft: '#FFF3D6',
  mint: '#2FB38A',
  mintSoft: '#DDF5EC',
  lavender: '#8672F2',
  lavenderSoft: '#EEEAFF',
  sky: '#3D9BF0',
  skySoft: '#E2F0FE',
  pink: '#EC6FA4',
  pinkSoft: '#FDE7F1',
  bg: '#FFF8F2',
  card: '#FFFFFF',
  text: '#3B2F3A',
  muted: '#6E606B', // >= 4.5:1 on white and cream (WCAG AA)
  border: '#F2E3DC',
  danger: '#C62833',
  dangerSoft: '#FDE8EA',
  warn: '#B45309',
  warnSoft: '#FFF1DC',
  ok: '#157A58',
  okSoft: '#DDF5EC',
  info: '#5B5BD6',
  infoSoft: '#ECEBFD',
};

/**
 * Semantic status colours. Every status is ALWAYS rendered with an icon and a text label too,
 * never colour alone: green on track, yellow monitor, orange action recommended, red urgent,
 * blue information, purple AI.
 */
export const statusColor = {
  ok: { fg: '#146C4E', bg: '#DDF5EC', dot: '🟢' },
  monitor: { fg: '#7A5600', bg: '#FFF4CC', dot: '🟡' },
  action: { fg: '#A94306', bg: '#FFEAD5', dot: '🟠' },
  urgent: { fg: '#B42318', bg: '#FDE8EA', dot: '🔴' },
  info: { fg: '#1D5FAF', bg: '#E2F0FE', dot: 'ℹ️' },
  ai: { fg: '#5B45D6', bg: '#EEEAFF', dot: '🤖' },
  unknown: { fg: '#6E606B', bg: '#F3ECE8', dot: '⚪' },
} as const;
export type StatusKey = keyof typeof statusColor;

export const riskColor = {
  low: { fg: '#146C4E', bg: '#DDF5EC' },
  medium: { fg: '#7A5600', bg: '#FFF4CC' },
  high: { fg: '#B42318', bg: '#FDE8EA' },
} as const;

/** Cheerful tile colours used for feature buttons, recipe cards and avatars. */
export const tilePalette = [
  { fg: colors.primaryDark, bg: colors.primarySoft },
  { fg: colors.ok, bg: colors.mintSoft },
  { fg: '#9A6300', bg: colors.accentSoft },
  { fg: colors.lavender, bg: colors.lavenderSoft },
  { fg: colors.sky, bg: colors.skySoft },
  { fg: colors.pink, bg: colors.pinkSoft },
];

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
};

export const radius = { sm: 12, md: 18, lg: 24, pill: 999 };

export const shadow: ViewStyle =
  Platform.OS === 'android'
    ? { elevation: 2 }
    : { shadowColor: '#B8433A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } };

export const space = (n: number) => n * 4;

/** Minimum comfortable touch target (WCAG 2.5.5 / platform guidelines). */
export const TOUCH = 44;
