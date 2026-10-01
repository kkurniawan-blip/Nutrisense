import { Platform, ViewStyle } from 'react-native';

/**
 * Soft pastel design: a calm lavender for actions, airy white cards on a faint lavender page,
 * and one gentle tint per feature (blue growth, green food, lavender help, orange packages).
 * Every text colour keeps at least 4.5:1 contrast on its background (WCAG AA).
 */
export const colors = {
  primary: '#6C5CE7', // lavender: main actions (white text 4.9:1)
  primaryDark: '#5443C9',
  primarySoft: '#EFECFF',
  primaryLight: '#9A8FF6', // light end of the button gradient
  accent: '#F59E0B', // orange highlights, never text on white
  accentSoft: '#FFF3E0',
  mint: '#16875A', // green actions (white text 4.5:1)
  mintSoft: '#E6F6EE',
  lavender: '#6C5CE7', // AI
  lavenderSoft: '#EFECFF',
  sky: '#2F6FE0',
  skySoft: '#EAF2FF',
  pink: '#B5336A',
  pinkSoft: '#FFEEF3',
  orange: '#C2410C',
  orangeSoft: '#FFF1E6',
  ink: '#2D2A4A', // deep text colour
  inkSoft: '#46426A',
  bg: '#F7F6FC',
  card: '#FFFFFF',
  text: '#2D2A4A',
  muted: '#646080', // 5.9:1 on white, 5.5:1 on the lavender page
  border: '#ECE9F6',
  line: '#F1EFF8',
  danger: '#D23A4B',
  dangerSoft: '#FFEDEF',
  warn: '#B45309',
  warnSoft: '#FFF4E5',
  ok: '#15803D',
  okSoft: '#E6F6EE',
  info: '#1D4ED8',
  infoSoft: '#EAF2FF',
};

/**
 * Semantic status colours. Every status is ALWAYS shown with a dot and a text label too,
 * never colour alone: green on track, yellow monitor, orange action recommended, red urgent,
 * blue information, lavender AI.
 */
export const statusColor = {
  ok: { fg: '#13733A', bg: '#E6F6EE', dot: '🟢', mark: '#22C55E' },
  monitor: { fg: '#8A5A00', bg: '#FEF6D8', dot: '🟡', mark: '#EAB308' },
  action: { fg: '#C2410C', bg: '#FFF1E6', dot: '🟠', mark: '#F97316' },
  urgent: { fg: '#C81E3A', bg: '#FFE9EC', dot: '🔴', mark: '#EF4444' },
  info: { fg: '#1D4ED8', bg: '#EAF2FF', dot: 'ℹ️', mark: '#3B82F6' },
  ai: { fg: '#5443C9', bg: '#EFECFF', dot: '🤖', mark: '#6C5CE7' },
  unknown: { fg: '#646080', bg: '#F1EFF8', dot: '⚪', mark: '#A09CB5' },
} as const;
export type StatusKey = keyof typeof statusColor;

export const riskColor = {
  low: { fg: '#15803D', bg: '#E6F6EE' },
  medium: { fg: '#8A5A00', bg: '#FEF6D8' },
  high: { fg: '#C81E3A', bg: '#FFE9EC' },
} as const;

/**
 * One pastel family per feature: `from`/`to` for the gradient icon square, `fg` for text and
 * icons on the tint, `bg` for the soft card tint.
 */
export const tones = {
  lavender: { from: '#A99FFF', to: '#6C5CE7', fg: '#5443C9', bg: '#F1EEFF' },
  blue: { from: '#7DB4FF', to: '#3B7BF6', fg: '#2563C9', bg: '#EDF4FF' },
  green: { from: '#6FDB9E', to: '#1FA06A', fg: '#15803D', bg: '#EAF8F0' },
  orange: { from: '#FFC078', to: '#F97316', fg: '#C2410C', bg: '#FFF3E8' },
  pink: { from: '#FF9CBC', to: '#E0578B', fg: '#B5336A', bg: '#FFF0F5' },
  yellow: { from: '#FFDA70', to: '#F2A60C', fg: '#8A5A00', bg: '#FFF8E1' },
} as const;
export type Tone = keyof typeof tones;

/** Recipe and tile colours, in a fixed order. */
export const tilePalette = [tones.lavender, tones.green, tones.orange, tones.blue, tones.pink, tones.yellow];

export const fonts = {
  // Plus Jakarta Sans (designed in Jakarta by Tokotype): friendly, open and very readable.
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const radius = { sm: 10, md: 14, lg: 22, pill: 999 };

/** A very soft lavender glow under cards and floating buttons. */
export const shadow: ViewStyle =
  Platform.OS === 'android'
    ? { elevation: 2, shadowColor: '#6C5CE7' }
    : { shadowColor: '#6C5CE7', shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } };

/**
 * Frosted-glass surface: translucent white over the page washes, a bright hairline edge and a
 * whisper of shadow. Android draws elevation through translucent views, so it gets a solid card.
 */
export const glass: ViewStyle =
  Platform.OS === 'android'
    ? { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE9F6', elevation: 1 }
    : { backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', ...shadow };

export const space = (n: number) => n * 4;

/** Minimum comfortable touch target (WCAG 2.5.5 / platform guidelines). */
export const TOUCH = 44;
