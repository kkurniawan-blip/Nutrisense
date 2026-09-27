/** Friendly, playful helpers for the mother-facing experience (emoji, stickers, streaks, tips). */
import type { Lang, Meal, Measurement } from './types';

export const FOOD_EMOJI: Record<string, string> = {
  nasi: '🍚', bubur_beras: '🥣', jagung: '🌽', singkong: '🥔', roti: '🍞', mie: '🍜', pmt_biskuit: '🍪',
  ubi_jalar: '🍠', telur: '🥚', ikan: '🐟', ikan_teri: '🐟', ayam: '🍗', hati_ayam: '🍖', daging_sapi: '🥩',
  daging_babi: '🥓', tempe: '🫘', tahu: '🧈', kacang_hijau: '🫛', kacang_tanah: '🥜', daun_kelor: '🌿',
  bayam: '🥬', daun_singkong: '🍃', wortel: '🥕', labu: '🎃', pepaya: '🍈', mangga: '🥭', pisang: '🍌',
  jeruk: '🍊', sayur_sop: '🍲', susu: '🥛', asi: '🤱', biskuit: '🍪',
};

/** WHO food groups as the eight colours of the "rainbow plate". */
export const FOOD_GROUPS: { key: string; color: string; emoji: string; id: string; en: string }[] = [
  { key: 'breast_milk', color: '#EC6FA4', emoji: '🤱', id: 'ASI', en: 'Breast milk' },
  { key: 'grains_roots', color: '#FFB938', emoji: '🍚', id: 'Makanan pokok', en: 'Staples' },
  { key: 'pulses_nuts', color: '#A0714F', emoji: '🫘', id: 'Kacang', en: 'Beans & nuts' },
  { key: 'dairy', color: '#3D9BF0', emoji: '🥛', id: 'Susu', en: 'Dairy' },
  { key: 'flesh', color: '#EF6352', emoji: '🐟', id: 'Ikan & daging', en: 'Fish & meat' },
  { key: 'eggs', color: '#F4A23C', emoji: '🥚', id: 'Telur', en: 'Eggs' },
  { key: 'vita_fruit_veg', color: '#2FB38A', emoji: '🥕', id: 'Sayur & buah oranye/hijau', en: 'Vitamin-A veg & fruit' },
  { key: 'other_fruit_veg', color: '#8672F2', emoji: '🍌', id: 'Sayur & buah lain', en: 'Other veg & fruit' },
];

export const SYMPTOM_EMOJI: Record<string, string> = {
  diarrhea: '🧻', fever: '🌡️', cough: '😷', vomiting: '🤢', poor_appetite: '🍽️', rash: '🔴', convulsions: '⚡',
  unable_to_drink: '🍼', lethargy: '😴', fast_breathing: '🫁', oedema: '🦶', runny_nose: '🤧', worms: '🪱',
  weight_loss: '⚖️', bloody_stool: '🩸', sunken_eyes: '👁️', repeated_illness: '🔁', high_fever: '🔥', vomits_everything: '🤮',
};

export const NUTRIENT_EMOJI: Record<string, string> = {
  energy_kcal: '⚡', protein_g: '💪', iron_mg: '🩸', zinc_mg: '🛡️', vitamin_a_mcg: '👀', calcium_mg: '🦴',
};

export function formatAge(months: number, lang: Lang): string {
  const m = Math.floor(months);
  if (m < 1) return lang === 'id' ? 'baru lahir' : 'newborn';
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (lang === 'id') return y ? `${y} th${r ? ` ${r} bln` : ''}` : `${r} bln`;
  return y ? `${y} yr${r ? ` ${r} mo` : ''}` : `${r} mo`;
}

export function childEmoji(sex: 'male' | 'female', months: number): string {
  if (months < 12) return '👶';
  return sex === 'female' ? '👧' : '👦';
}

export function greeting(lang: Lang): string {
  const h = new Date().getHours();
  if (lang === 'id') return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Mother-friendly status wording (clinical labels stay on the staff screens). */
export const FRIENDLY_RISK = {
  low: { emoji: '🌱', id: 'Tumbuh baik', en: 'Growing well' },
  medium: { emoji: '👀', id: 'Perlu dipantau', en: 'Keep an eye on it' },
  high: { emoji: '💛', id: 'Perlu perhatian', en: 'Needs attention' },
} as const;

const TIPS: { id: string; en: string }[] = [
  { id: 'Daun kelor kaya zat besi dan vitamin A. Coba campurkan ke bubur si kecil hari ini! 🌿', en: 'Moringa leaves are rich in iron and vitamin A. Try stirring some into today’s porridge! 🌿' },
  { id: 'Satu butir telur sehari membantu si kecil tumbuh tinggi. Murah dan mudah! 🥚', en: 'One egg a day helps your little one grow tall. Cheap and easy! 🥚' },
  { id: 'Cuci tangan pakai sabun sebelum menyuapi mencegah diare. 🧼', en: 'Washing hands with soap before feeding helps prevent diarrhoea. 🧼' },
  { id: 'Ikan lokal sama bergizinya dengan ikan mahal. Pilih yang segar ya, Bunda! 🐟', en: 'Local fish is as nutritious as expensive fish. Just pick it fresh! 🐟' },
  { id: 'Timbang dan ukur si kecil setiap bulan di Posyandu agar tumbuhnya terpantau. 📏', en: 'Weigh and measure your child at the Posyandu every month. 📏' },
  { id: 'Piring pelangi = sehat! Usahakan 5 warna kelompok makanan setiap hari. 🌈', en: 'A rainbow plate is a healthy plate! Aim for 5 food-group colours a day. 🌈' },
  { id: 'ASI tetap penting sampai usia 2 tahun, meski si kecil sudah makan. 🤱', en: 'Breast milk stays important until age 2, even after solids start. 🤱' },
  { id: 'Saat anak sakit, tetap beri makan sedikit-sedikit tapi sering. 💕', en: 'When your child is ill, keep offering small, frequent meals. 💕' },
  { id: 'Jagung bose + ikan = makan siang khas NTT yang kaya protein! 🌽', en: 'Jagung bose with fish: a protein-packed NTT lunch! 🌽' },
  { id: 'Tempe dan tahu adalah protein murah yang disukai anak-anak. 🫘', en: 'Tempeh and tofu are cheap proteins kids love. 🫘' },
];

export function tipOfTheDay(lang: Lang): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return TIPS[day % TIPS.length][lang];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function groupsToday(meals: Meal[]): string[] {
  const today = dayKey(new Date());
  return [...new Set(meals.filter((m) => dayKey(new Date(m.eaten_at)) === today).flatMap((m) => m.food_groups))];
}

/** Consecutive days (ending today or yesterday) with at least one meal logged. */
export function mealStreak(meals: Meal[]): number {
  const days = new Set(meals.map((m) => dayKey(new Date(m.eaten_at))));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface Sticker {
  key: string;
  emoji: string;
  title: string;
  earned: boolean;
}

export function stickers(meals: Meal[], measurements: Measurement[], lang: Lang): Sticker[] {
  const L = lang === 'id';
  const weekAgo = Date.now() - 7 * 86_400_000;
  const week = meals.filter((m) => new Date(m.eaten_at).getTime() >= weekAgo);
  const proteinDays = new Set(
    week.filter((m) => m.food_groups.some((g) => ['flesh', 'eggs', 'dairy'].includes(g))).map((m) => dayKey(new Date(m.eaten_at))),
  ).size;
  const last = measurements[measurements.length - 1];
  const measuredRecently = !!last && Date.now() - new Date(last.measured_at).getTime() < 35 * 86_400_000;
  const groupsByDay: Record<string, Set<string>> = {};
  for (const m of week) {
    const k = dayKey(new Date(m.eaten_at));
    groupsByDay[k] ??= new Set();
    m.food_groups.forEach((g) => groupsByDay[k].add(g));
  }
  const rainbowDays = Object.values(groupsByDay).filter((s) => s.size >= 5).length;
  return [
    { key: 'measure', emoji: '📏', title: L ? 'Rajin ukur' : 'Measured this month', earned: measuredRecently },
    { key: 'streak', emoji: '🔥', title: L ? '3 hari mencatat' : '3-day log streak', earned: mealStreak(meals) >= 3 },
    { key: 'protein', emoji: '🥚', title: L ? 'Jagoan protein' : 'Protein hero', earned: proteinDays >= 5 },
    { key: 'rainbow', emoji: '🌈', title: L ? 'Piring pelangi' : 'Rainbow plate', earned: rainbowDays >= 1 },
  ];
}

/** Interpolated WHO median (0 SD) from the growth-chart reference, for the "compared with peers" bar. */
export function medianAt(reference: Record<string, [number, number][]> | undefined, age: number): number | null {
  const pts = reference?.['0'];
  if (!pts?.length) return null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= age) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((age - x0) / (x1 - x0 || 1)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "45 mnt" or "12 jam 35 mnt" / "12 h 35 min": long trips read as hours, not thousands of minutes. */
export function formatDuration(minutes: number, lang: Lang): string {
  const m = Math.max(0, Math.round(minutes));
  const [h, min] = lang === 'id' ? ['jam', 'mnt'] : ['h', 'min'];
  if (m < 90) return `${m} ${min}`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} ${h} ${rest} ${min}` : `${hours} ${h}`;
}

/** "27 Sep 2026" (optionally with time), independent of the phone's Intl support. */
export function formatDate(iso: string | null | undefined, lang: Lang, withTime = false): string {
  if (!iso) return '–';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const base = `${d.getDate()} ${MONTHS[lang][d.getMonth()]} ${d.getFullYear()}`;
  if (!withTime) return base;
  return `${base} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Everyday names mothers use for the WHO food groups. */
export const GROUP_PLAIN: Record<string, { id: string; en: string }> = {
  breast_milk: { id: 'ASI', en: 'Breast milk' },
  grains_roots: { id: 'Karbohidrat', en: 'Carbohydrates' },
  pulses_nuts: { id: 'Kacang-kacangan', en: 'Beans & nuts' },
  dairy: { id: 'Susu', en: 'Milk' },
  flesh: { id: 'Protein hewani', en: 'Meat & fish' },
  eggs: { id: 'Telur', en: 'Eggs' },
  vita_fruit_veg: { id: 'Sayur hijau & oranye', en: 'Green & orange veg' },
  other_fruit_veg: { id: 'Buah & sayur lain', en: 'Other fruit & veg' },
};
