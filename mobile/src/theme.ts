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
  muted: '#8C7E89',
  border: '#F2E3DC',
  danger: '#DC3545',
  dangerSoft: '#FDE8EA',
  warn: '#D97A0B',
  warnSoft: '#FFF1DC',
  ok: '#1F9D74',
  okSoft: '#DDF5EC',
  info: '#5B5BD6',
  infoSoft: '#ECEBFD',
};

export const riskColor = {
  low: { fg: colors.ok, bg: colors.okSoft },
  medium: { fg: colors.warn, bg: colors.warnSoft },
  high: { fg: colors.danger, bg: colors.dangerSoft },
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
