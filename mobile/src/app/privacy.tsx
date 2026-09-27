import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../components/Text';
import { Bubble, Card, ErrorBox, H2, Loading, Row, Screen, StatusPill, Toggle } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Lang } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors, type StatusKey } from '../theme';

type Scope = 'data_processing' | 'ai_analysis' | 'satusehat_sharing' | 'research_use';
type Consents = Record<Scope, boolean>;
type L = Record<Lang, string>;

interface Category {
  scope: Scope;
  emoji: string;
  badge: { status: StatusKey; label: L };
  title: L;
  why: L;
  shared: L[];
  who: L;
  details: L;
}

/** Plain-language consent categories: what each one is for, what is shared, with whom. */
const CATEGORIES: Category[] = [
  {
    scope: 'data_processing',
    emoji: '📋',
    badge: { status: 'info', label: { id: 'Wajib', en: 'Required' } },
    title: { id: 'Data dasar anak', en: "Child's basic data" },
    why: { id: 'Dibutuhkan agar aplikasi bisa mencatat dan memantau pertumbuhan.', en: 'Needed so the app can record and monitor growth.' },
    shared: [
      { id: 'Nama, tanggal lahir, jenis kelamin', en: 'Name, date of birth, sex' },
      { id: 'Berat, tinggi, lingkar lengan', en: 'Weight, height, arm circumference' },
      { id: 'Desa/wilayah', en: 'Village/area' },
    ],
    who: { id: 'Anda, Kader wilayah Anda, dan petugas Puskesmas.', en: 'You, your area Kader and Puskesmas staff.' },
    details: {
      id: 'Data disimpan terenkripsi di server NutriSense. Hanya tim perawatan anak yang bisa melihatnya. Anda bisa meminta data dihapus lewat Kader atau Puskesmas.',
      en: "Data is stored encrypted on the NutriSense server. Only the child's care team can see it. You can ask for data to be deleted via your Kader or Puskesmas.",
    },
  },
  {
    scope: 'ai_analysis',
    emoji: '🤖',
    badge: { status: 'ai', label: { id: 'Untuk fitur AI', en: 'For AI features' } },
    title: { id: 'Analisis AI', en: 'AI analysis' },
    why: { id: 'Untuk NutriScan, cek gejala, Tanya Nuri, dan analisis risiko pertumbuhan.', en: 'For NutriScan, symptom checker, Tanya Nuri and growth risk analysis.' },
    shared: [
      { id: 'Foto makanan yang Anda ambil', en: 'Food photos you take' },
      { id: 'Gejala dan pertanyaan yang Anda tulis', en: 'Symptoms and questions you type' },
      { id: 'Usia dan hasil pengukuran (tanpa nama)', en: 'Age and measurements (without name)' },
    ],
    who: { id: 'Layanan AI yang dipakai NutriSense. Tidak dipakai untuk iklan.', en: 'The AI service NutriSense uses. Never used for advertising.' },
    details: {
      id: 'Jika dimatikan, pencatatan tetap berjalan dan Anda tetap mendapat panduan dasar, tetapi NutriScan foto dan Tanya Nuri berbasis AI tidak tersedia. Hasil AI bukan diagnosis medis.',
      en: "If turned off, recording still works and you still get basic guidance, but photo NutriScan and AI-based Tanya Nuri are unavailable. AI results are not a medical diagnosis.",
    },
  },
  {
    scope: 'satusehat_sharing',
    emoji: '🏥',
    badge: { status: 'ok', label: { id: 'Untuk layanan kesehatan', en: 'For health services' } },
    title: { id: 'Berbagi dengan SATUSEHAT', en: 'Share with SATUSEHAT' },
    why: { id: 'Agar catatan pertumbuhan anak tersambung dengan rekam kesehatan nasional.', en: "So your child's growth records connect with the national health record." },
    shared: [
      { id: 'Identitas anak dan hasil pengukuran', en: 'Child identity and measurements' },
      { id: 'Hasil pemeriksaan yang sudah ditinjau petugas', en: 'Results reviewed by health workers' },
    ],
    who: { id: 'SATUSEHAT, Kementerian Kesehatan RI.', en: 'SATUSEHAT, Indonesian Ministry of Health.' },
    details: {
      id: 'Membantu dokter dan bidan di fasilitas lain melihat riwayat pertumbuhan anak. Bisa dimatikan kapan saja; data yang sudah terkirim tetap tersimpan di SATUSEHAT.',
      en: "Helps doctors and midwives at other facilities see your child's growth history. Can be turned off any time; data already sent stays in SATUSEHAT.",
    },
  },
  {
    scope: 'research_use',
    emoji: '🔬',
    badge: { status: 'unknown', label: { id: 'Opsional', en: 'Optional' } },
    title: { id: 'Penelitian', en: 'Research' },
    why: { id: 'Membantu peneliti memahami dan mencegah stunting di NTT.', en: 'Helps researchers understand and prevent stunting in NTT.' },
    shared: [{ id: 'Data tanpa nama dan tanpa alamat (anonim)', en: 'Data without name or address (anonymised)' }],
    who: { id: 'Tim peneliti yang disetujui.', en: 'Approved research teams.' },
    details: {
      id: 'Tidak memengaruhi layanan untuk anak Anda. Anda tetap bisa memakai semua fitur walaupun ini dimatikan.',
      en: "Doesn't change the care your child receives. All features still work if this is off.",
    },
  },
];

function CategoryCard({ c, value, onChange }: { c: Category; value: boolean; onChange: (v: boolean) => void }) {
  const { t, lang } = useAuth();
  const [open, setOpen] = useState(false);
  const required = c.scope === 'data_processing';
  return (
    <Card>
      <StatusPill status={c.badge.status} label={c.badge.label[lang]} />
      <Row style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Toggle label={c.title[lang]} value={value} onChange={onChange} disabled={required} />
        </View>
      </Row>
      <Text style={{ color: colors.muted, lineHeight: 21 }}>{c.why[lang]}</Text>
      <Text style={{ fontWeight: '800', marginTop: 10, marginBottom: 4 }}>{t('whatIsShared')}</Text>
      {c.shared.map((s) => (
        <Text key={s.en} style={{ lineHeight: 22 }}>
          • {s[lang]}
        </Text>
      ))}
      <Text style={{ marginTop: 6, lineHeight: 21 }}>
        <Text style={{ fontWeight: '800' }}>{t('sharedWith')}: </Text>
        {c.who[lang]}
      </Text>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontWeight: '800', color: colors.primaryDark }}>
          {open ? '▲' : '▼'} {t('seeDetails')}
        </Text>
      </Pressable>
      {open && <Text style={{ lineHeight: 21, color: colors.text }}>{c.details[lang]}</Text>}
    </Card>
  );
}

export default function Privacy() {
  const { t } = useAuth();
  const consents = useApi<Consents>('/api/consents');
  const [error, setError] = useState<string | null>(null);

  const set = async (scope: Scope, granted: boolean) => {
    setError(null);
    try {
      consents.setData(await api<Consents>('/api/consents', { body: { scope, granted } }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen>
      <Bubble mood="caring">{t('privacyIntro')}</Bubble>
      {error && <ErrorBox message={error} />}
      {consents.error && <ErrorBox message={consents.error} onRetry={consents.reload} />}
      {!consents.data ? (
        <Loading />
      ) : (
        CATEGORIES.map((c) => <CategoryCard key={c.scope} c={c} value={consents.data![c.scope]} onChange={(v) => set(c.scope, v)} />)
      )}
      <H2 emoji="🛡️">{t('yourRights')}</H2>
      <Text style={{ lineHeight: 22, color: colors.muted, marginBottom: 20 }}>{t('yourRightsText')}</Text>
    </Screen>
  );
}
