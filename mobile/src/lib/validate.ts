export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Strength = 'weak' | 'ok' | 'strong';

/** Simple, explainable password strength: length plus a mix of letters, numbers and symbols. */
export function passwordStrength(pw: string): Strength | null {
  if (!pw) return null;
  if (pw.length < 8) return 'weak';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return pw.length >= 10 && kinds >= 3 ? 'strong' : kinds >= 2 ? 'ok' : 'weak';
}

/**
 * Values no child under 5 can have: almost always a typing mistake or weight and height entered the wrong
 * way round. These block saving (soft warnings for big changes are handled on the screen).
 */
export function measurementProblems(weightKg: number, heightCm: number): { weight: boolean; height: boolean; swapped: boolean } {
  const weight = !(weightKg >= 1 && weightKg <= 35);
  const height = !(heightCm >= 40 && heightCm <= 125);
  const swapped = weight && height && weightKg >= 40 && weightKg <= 125 && heightCm >= 1 && heightCm <= 35;
  return { weight, height, swapped };
}
