/**
 * One place that turns AI results into plain, semantic statuses.
 * Mothers see warm growth wording; Kaders see action groups; the colour is never the only signal.
 */
import type { StatusKey } from '../theme';
import type { Assessment, CaseItem, Lang } from './types';

type Text = { id: string; en: string };
export interface Status {
  key: StatusKey;
  label: Text; // short pill label
  headline: Text; // sentence for a status card
}

const S = (key: StatusKey, label: Text, headline: Text): Status => ({ key, label, headline });

export function motherStatus(a: Assessment | null | undefined): Status {
  if (!a) return S('unknown', { id: 'Belum dinilai', en: 'Not assessed yet' }, { id: 'Catat pengukuran untuk melihat status', en: 'Record a measurement to see status' });
  if (a.triage.urgency === 'emergency')
    return S('urgent', { id: 'Perlu pertolongan segera', en: 'Needs help now' }, { id: 'Perlu pertolongan segera', en: 'Needs help now' });
  if (a.risk_level === 'high')
    return S('action', { id: 'Perlu perhatian', en: 'Needs attention' }, { id: 'Pertumbuhan perlu diperhatikan', en: 'Growth needs attention' });
  if (a.risk_level === 'medium')
    return S('monitor', { id: 'Perlu dipantau', en: 'Keep an eye on it' }, { id: 'Pertumbuhan perlu dipantau', en: 'Growth needs monitoring' });
  return S('ok', { id: 'Tumbuh baik', en: 'Growing well' }, { id: 'Pertumbuhan baik', en: 'Growing well' });
}

export type KaderGroup = 'followup' | 'attention' | 'monitored' | 'unassessed';

export const KADER_GROUPS: Record<KaderGroup, { key: StatusKey; label: Text }> = {
  followup: { key: 'urgent', label: { id: 'Butuh tindak lanjut', en: 'Needs follow-up' } },
  attention: { key: 'action', label: { id: 'Perlu perhatian', en: 'Needs attention' } },
  monitored: { key: 'ok', label: { id: 'Terpantau', en: 'On track' } },
  unassessed: { key: 'unknown', label: { id: 'Belum dinilai', en: 'Not assessed' } },
};

/** Staff-facing (clinical) status for a risk level. */
export function clinicalStatus(level: 'low' | 'medium' | 'high' | null | undefined): StatusKey {
  return level === 'high' ? 'urgent' : level === 'medium' ? 'action' : level === 'low' ? 'ok' : 'unknown';
}

export const txt = (t: Text, lang: Lang) => t[lang];

/** Plain words for a z-score, used instead of showing numbers to mothers. */
export function zWords(z: number | null | undefined, lang: Lang, kind: 'height' | 'weight' | 'balance'): { key: StatusKey; text: string } {
  const L = lang === 'id';
  if (z === null || z === undefined) return { key: 'unknown', text: L ? 'Belum ada data' : 'No data' };
  if (kind === 'balance') {
    if (z < -3) return { key: 'urgent', text: L ? 'Sangat kurus' : 'Very thin' };
    if (z < -2) return { key: 'action', text: L ? 'Kurus' : 'Thin' };
    if (z > 2) return { key: 'monitor', text: L ? 'Berat berlebih' : 'Overweight' };
    return { key: 'ok', text: L ? 'Seimbang' : 'Balanced' };
  }
  if (z < -3) return { key: 'urgent', text: L ? 'Jauh di bawah rata-rata' : 'Far below average' };
  if (z < -2) return { key: 'action', text: L ? 'Di bawah batas normal' : 'Below normal range' };
  if (z < -1) return { key: 'monitor', text: L ? 'Sedikit di bawah rata-rata' : 'A little below average' };
  return { key: 'ok', text: L ? 'Sesuai usia' : 'On track for age' };
}

/** Case priority as a semantic status: the same colours as risk levels (high red, medium orange, low green). */
export const PRIORITY_STATUS: Record<CaseItem['priority'], StatusKey> = { emergency: 'urgent', high: 'urgent', medium: 'action', low: 'ok' };
