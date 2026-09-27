export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Strength = 'weak' | 'ok' | 'strong';

/** Simple, explainable password strength: length plus a mix of letters, numbers and symbols. */
export function passwordStrength(pw: string): Strength | null {
  if (!pw) return null;
  if (pw.length < 8) return 'weak';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return pw.length >= 10 && kinds >= 3 ? 'strong' : kinds >= 2 ? 'ok' : 'weak';
}
