/** Ibu hamil: labels, symptom lists and small helpers shared by the pregnancy screens. */
import type { StatusKey } from '../theme';
import { localDate, ymd } from './dates';
import type { AncExam, Lang, MotherFlag, Pregnancy, VisitStatus } from './types';

type L = { id: string; en: string };

/** Buku KIA danger signs in pregnancy: any one means go to the health facility now. */
export const MOTHER_DANGER: { key: string; emoji: string; label: L }[] = [
  { key: 'bleeding', emoji: '🩸', label: { id: 'Perdarahan', en: 'Bleeding' } },
  { key: 'waters_break', emoji: '💧', label: { id: 'Air ketuban keluar', en: 'Waters break early' } },
  { key: 'swelling_headache', emoji: '🤕', label: { id: 'Bengkak & sakit kepala', en: 'Swelling & headache' } },
  { key: 'convulsions', emoji: '⚡', label: { id: 'Kejang', en: 'Seizure' } },
  { key: 'high_fever', emoji: '🌡️', label: { id: 'Demam tinggi', en: 'High fever' } },
  { key: 'less_movement', emoji: '👶', label: { id: 'Janin kurang bergerak', en: 'Baby moves less' } },
  { key: 'vomiting_all', emoji: '🤮', label: { id: 'Muntah terus', en: 'Vomiting everything' } },
  { key: 'breathless', emoji: '😮‍💨', label: { id: 'Sesak napas', en: 'Short of breath' } },
];

/** Common complaints: advice, no alarm. */
export const MOTHER_COMMON: { key: string; emoji: string; label: L; tip: L }[] = [
  { key: 'nausea', emoji: '🤢', label: { id: 'Mual', en: 'Nausea' }, tip: { id: 'Makan sedikit tapi sering', en: 'Eat small, frequent meals' } },
  { key: 'dizzy', emoji: '😵', label: { id: 'Pusing', en: 'Dizzy' }, tip: { id: 'Duduk, minum air, minum TTD', en: 'Sit, drink water, take the iron tablet' } },
  { key: 'back_pain', emoji: '🧍', label: { id: 'Sakit pinggang', en: 'Back pain' }, tip: { id: 'Istirahat, tidur miring', en: 'Rest, sleep on your side' } },
  { key: 'cramps', emoji: '🦵', label: { id: 'Kaki kram', en: 'Leg cramps' }, tip: { id: 'Regangkan kaki, cukup minum', en: 'Stretch, drink enough' } },
  { key: 'sleepless', emoji: '😴', label: { id: 'Sulit tidur', en: 'Hard to sleep' }, tip: { id: 'Tidur miring ke kiri', en: 'Sleep on your left side' } },
  { key: 'constipation', emoji: '🚽', label: { id: 'Sembelit', en: 'Constipation' }, tip: { id: 'Banyak minum dan makan sayur', en: 'Drink more, eat vegetables' } },
];

export const EDUCATION: { key: string; label: L }[] = [
  { key: 'none', label: { id: 'Tidak sekolah', en: 'No school' } },
  { key: 'sd', label: { id: 'SD', en: 'Primary' } },
  { key: 'smp', label: { id: 'SMP', en: 'Junior high' } },
  { key: 'sma', label: { id: 'SMA', en: 'Senior high' } },
  { key: 'higher', label: { id: 'Perguruan tinggi', en: 'College' } },
];

export const BIRTH_PLACES: { key: string; emoji: string; label: L }[] = [
  { key: 'puskesmas', emoji: '🏥', label: { id: 'Puskesmas', en: 'Puskesmas' } },
  { key: 'rs', emoji: '🏨', label: { id: 'Rumah sakit', en: 'Hospital' } },
  { key: 'bidan', emoji: '👩‍⚕️', label: { id: 'Praktik bidan', en: 'Midwife clinic' } },
  { key: 'polindes', emoji: '🏠', label: { id: 'Polindes / Poskesdes', en: 'Village maternity post' } },
];

export const TRANSPORT: { key: string; emoji: string; label: L }[] = [
  { key: 'ambulans desa', emoji: '🚑', label: { id: 'Ambulans desa', en: 'Village ambulance' } },
  { key: 'ojek', emoji: '🛵', label: { id: 'Ojek', en: 'Motorbike taxi' } },
  { key: 'mobil', emoji: '🚙', label: { id: 'Mobil keluarga / tetangga', en: 'Family or neighbour car' } },
  { key: 'perahu', emoji: '⛵', label: { id: 'Perahu', en: 'Boat' } },
];

/** Penolong persalinan: who helps at the birth. Buku KIA: always a health worker (bidan or doctor). */
export const BIRTH_HELPERS: { key: string; emoji: string; label: L }[] = [
  { key: 'bidan', emoji: '👩‍⚕️', label: { id: 'Bidan', en: 'Midwife' } },
  { key: 'dokter', emoji: '🩺', label: { id: 'Dokter', en: 'Doctor' } },
];

/** Who actually helped at a birth (Catat kelahiran): includes the answers that need follow-up. */
export const BIRTH_ATTENDANTS: { key: string; emoji: string; label: L }[] = [
  ...BIRTH_HELPERS,
  { key: 'dukun', emoji: '🧓', label: { id: 'Dukun bayi', en: 'Traditional birth attendant' } },
  { key: 'family', emoji: '👪', label: { id: 'Keluarga', en: 'Family' } },
  { key: 'none', emoji: '➖', label: { id: 'Tidak ada', en: 'No one' } },
];

/** Where the baby was actually born. */
export const BIRTH_PLACES_DONE: { key: string; emoji: string; label: L }[] = [
  { key: 'puskesmas', emoji: '🏥', label: { id: 'Puskesmas', en: 'Puskesmas' } },
  { key: 'rs', emoji: '🏨', label: { id: 'Rumah sakit', en: 'Hospital' } },
  { key: 'bidan', emoji: '👩‍⚕️', label: { id: 'Praktik bidan', en: 'Midwife clinic' } },
  { key: 'polindes', emoji: '🏠', label: { id: 'Polindes / Poskesdes', en: 'Village maternity post' } },
  { key: 'home', emoji: '🛖', label: { id: 'Rumah', en: 'Home' } },
  { key: 'on_the_way', emoji: '🛵', label: { id: 'Di perjalanan', en: 'On the way' } },
];

/** Biaya persalinan. */
export const FUNDING: { key: string; emoji: string; label: L }[] = [
  { key: 'jkn', emoji: '💳', label: { id: 'JKN / KIS', en: 'JKN / KIS (national insurance)' } },
  { key: 'jampersal', emoji: '🏛️', label: { id: 'Jampersal', en: 'Jampersal (birth scheme)' } },
  { key: 'tabulin', emoji: '🐷', label: { id: 'Tabungan ibu bersalin', en: 'Birth savings' } },
  { key: 'self', emoji: '👛', label: { id: 'Biaya sendiri', en: 'Own money' } },
];

export const ANC_PLACES: { key: string; label: L }[] = [
  { key: 'puskesmas', label: { id: 'Puskesmas', en: 'Puskesmas' } },
  { key: 'posyandu', label: { id: 'Posyandu', en: 'Posyandu' } },
  { key: 'bidan', label: { id: 'Bidan', en: 'Midwife' } },
  { key: 'rs', label: { id: 'Rumah sakit', en: 'Hospital' } },
];

export const FLAG_LABEL: Record<MotherFlag['code'], L> = {
  kek: { id: 'Lengan kecil (KEK)', en: 'Thin arm (CED)' },
  anemia: { id: 'Kurang darah (anemia)', en: 'Anaemia' },
  severe_anemia: { id: 'Sangat kurang darah', en: 'Severe anaemia' },
  short_stature: { id: 'Tinggi < 145 cm', en: 'Height < 145 cm' },
  hypertension: { id: 'Tekanan darah tinggi', en: 'High blood pressure' },
  fetal_hr: { id: 'Detak jantung janin perlu dicek', en: "Baby's heartbeat needs checking" },
};

export const FLAG_ADVICE: Record<MotherFlag['code'], L> = {
  kek: { id: 'Makan makanan tambahan ibu hamil setiap hari', en: 'Eat the supplementary food every day' },
  anemia: { id: 'Minum tablet tambah darah setiap hari', en: 'Take the iron tablet every day' },
  severe_anemia: { id: 'Segera ke Puskesmas', en: 'Go to the Puskesmas now' },
  short_stature: { id: 'Rencanakan bersalin di Puskesmas atau RS', en: 'Plan to give birth at a Puskesmas or hospital' },
  hypertension: { id: 'Hubungi bidan hari ini', en: 'Call the midwife today' },
  fetal_hr: { id: 'Hubungi bidan hari ini', en: 'Call the midwife today' },
};

export const VISIT_STATUS: Record<VisitStatus, { key: StatusKey; label: L }> = {
  done: { key: 'ok', label: { id: 'Selesai', en: 'Done' } },
  due: { key: 'action', label: { id: 'Sekarang', en: 'Now' } },
  overdue: { key: 'urgent', label: { id: 'Terlewat', en: 'Missed' } },
  upcoming: { key: 'unknown', label: { id: 'Nanti', en: 'Later' } },
};

export const NIFAS_LABEL: Record<string, L> = {
  KF1: { id: 'Nifas 1 · ibu', en: 'Postnatal 1 · mother' },
  KF2: { id: 'Nifas 2 · ibu', en: 'Postnatal 2 · mother' },
  KF3: { id: 'Nifas 3 · ibu', en: 'Postnatal 3 · mother' },
  KF4: { id: 'Nifas 4 · ibu', en: 'Postnatal 4 · mother' },
  KN1: { id: 'Bayi baru lahir 1', en: 'Newborn 1' },
  KN2: { id: 'Bayi baru lahir 2', en: 'Newborn 2' },
  KN3: { id: 'Bayi baru lahir 3', en: 'Newborn 3' },
};

export const label = (items: { key: string; label: L }[], key: string | null | undefined, lang: Lang) =>
  items.find((i) => i.key === key)?.label[lang] ?? key ?? '';

/** The mother's level for the status pill: from the server's risk (Belum dicek ... Risiko tinggi), with its reasons. */
export function motherState(p: Pregnancy): { key: StatusKey; text: string; reasons: string } {
  const key: StatusKey = p.risk.key;
  return { key, text: p.risk.label, reasons: p.risk.reasons.join(' · ') };
}

/** "24 minggu 3 hari" */
export const weeksText = (w: number, d: number, lang: Lang) => (lang === 'id' ? `${w} minggu ${d} hari` : `${w} weeks ${d} days`);

/** Gestational age and HPL from HPHT, for the preview before saving. */
export function fromHpht(hpht: string) {
  const start = new Date(`${hpht}T00:00:00`);
  const days = Math.floor((Date.now() - start.getTime()) / 86400000);
  const hpl = new Date(start.getTime() + 280 * 86400000);
  return { days, weeks: Math.floor(days / 7), extra: days % 7, hpl: ymd(hpl) };
}

export const hphtFromWeeks = (weeks: number) => localDate(-Math.round(weeks * 7));

/**
 * Status of each check-up value from the Puskesmas, for the status colours. Thresholds mirror the backend
 * (backend/app/ai/maternal.py): BP >= 140/90 and a fetal heart rate outside 120-160 urgent; Hb < 7 urgent,
 * < 11 action; LiLA < 23.5 action. Fetal position and urine protein are advice only (not risk flags).
 */
export type ExamField = 'bp' | 'hb' | 'muac' | 'fhr' | 'presentation' | 'urine';
export type ExamFlag = 'hypertension' | 'fetal_hr' | 'severe_anemia' | 'anemia' | 'kek';

const RANK: Record<StatusKey, number> = { urgent: 0, action: 1, monitor: 2, info: 3, ai: 3, unknown: 4, ok: 5 };

export function examStatus(e: AncExam): { field: ExamField; key: StatusKey; word: { id: string; en: string } }[] {
  const out: { field: ExamField; key: StatusKey; word: { id: string; en: string } }[] = [];
  const normal = { id: 'Normal', en: 'Normal' };
  if (e.bp_systolic != null || e.bp_diastolic != null) {
    const high = (e.bp_systolic ?? 0) >= 140 || (e.bp_diastolic ?? 0) >= 90;
    out.push({ field: 'bp', key: high ? 'urgent' : 'ok', word: high ? { id: 'Tinggi', en: 'High' } : normal });
  }
  if (e.hb_g_dl != null)
    out.push(
      e.hb_g_dl < 7
        ? { field: 'hb', key: 'urgent', word: { id: 'Sangat kurang darah', en: 'Very low' } }
        : e.hb_g_dl < 11
          ? { field: 'hb', key: 'action', word: { id: 'Kurang darah', en: 'Low' } }
          : { field: 'hb', key: 'ok', word: normal },
    );
  if (e.muac_cm != null)
    out.push(e.muac_cm < 23.5 ? { field: 'muac', key: 'action', word: { id: 'Lengan kecil (KEK)', en: 'Thin arm (CED)' } } : { field: 'muac', key: 'ok', word: normal });
  if (e.fetal_heart_rate != null) {
    const off = e.fetal_heart_rate < 120 || e.fetal_heart_rate > 160;
    out.push({ field: 'fhr', key: off ? 'urgent' : 'ok', word: off ? { id: 'Perlu dicek', en: 'Needs checking' } : normal });
  }
  if (e.fetal_presentation && e.fetal_presentation !== 'head')
    out.push(
      (e.gestational_weeks ?? 0) >= 36
        ? { field: 'presentation', key: 'action', word: { id: 'Tanyakan ke bidan', en: 'Ask the midwife' } }
        : { field: 'presentation', key: 'info', word: { id: 'Masih bisa berubah', en: 'Can still change' } },
    );
  if (e.urine_protein) {
    const neg = /^neg/i.test(e.urine_protein);
    out.push({ field: 'urine', key: neg ? 'ok' : 'action', word: neg ? { id: 'Tidak ada', en: 'None' } : { id: 'Ada protein', en: 'Protein found' } });
  }
  return out.sort((a, b) => RANK[a.key] - RANK[b.key]);
}

/** The most serious flag of a check-up, for the action box (same order as the backend's risk reasons). */
export function examWorstFlag(e: AncExam): ExamFlag | null {
  if ((e.bp_systolic ?? 0) >= 140 || (e.bp_diastolic ?? 0) >= 90) return 'hypertension';
  if (e.fetal_heart_rate != null && (e.fetal_heart_rate < 120 || e.fetal_heart_rate > 160)) return 'fetal_hr';
  if (e.hb_g_dl != null && e.hb_g_dl < 7) return 'severe_anemia';
  if (e.hb_g_dl != null && e.hb_g_dl < 11) return 'anemia';
  if (e.muac_cm != null && e.muac_cm < 23.5) return 'kek';
  return null;
}

/** "N perlu perhatian" style counts. */
export function examCounts(e: AncExam) {
  const s = examStatus(e);
  return { urgent: s.filter((x) => x.key === 'urgent').length, action: s.filter((x) => x.key === 'action').length };
}
