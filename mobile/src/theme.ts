export const colors = {
  primary: '#0E7C66',
  primaryDark: '#0A5E4D',
  primarySoft: '#E7F5F0',
  accent: '#F59E0B',
  bg: '#F5F7F6',
  card: '#FFFFFF',
  text: '#1B2B27',
  muted: '#5D6D68',
  border: '#DDE5E2',
  danger: '#C62828',
  dangerSoft: '#FDECEC',
  warn: '#B45309',
  warnSoft: '#FFF4E0',
  ok: '#15803D',
  okSoft: '#E6F6EC',
  info: '#1D4ED8',
  infoSoft: '#E8EEFD',
};

export const riskColor = {
  low: { fg: colors.ok, bg: colors.okSoft },
  medium: { fg: colors.warn, bg: colors.warnSoft },
  high: { fg: colors.danger, bg: colors.dangerSoft },
} as const;

export const space = (n: number) => n * 4;
