import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '../components/Text';
import { Button, Card, ErrorBox, ListRow, Loading, MoreLink, Row, Screen, Toggle } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { FacilityLink, Lang, Pregnancy } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors } from '../theme';

type Scope = 'data_processing' | 'ai_analysis' | 'satusehat_sharing' | 'research_use';
type Consents = Record<Scope, boolean>;
type L = Record<Lang, string>;

interface Category {
  scope: Scope;
  emoji: string;
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
    title: { id: 'Data pertumbuhan', en: 'Growth data' },
    why: { id: 'Wajib, untuk mencatat pertumbuhan.', en: 'Required, to record growth.' },
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
    title: { id: 'Analisis AI', en: 'AI analysis' },
    why: { id: 'Untuk NutriScan, cek gejala dan Tanya Nuri.', en: 'For NutriScan, symptoms and Tanya Nuri.' },
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
    title: { id: 'Berbagi ke SATUSEHAT', en: 'Share with SATUSEHAT' },
    why: { id: 'Tersambung ke rekam kesehatan nasional.', en: 'Links to the national health record.' },
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
    title: { id: 'Data penelitian', en: 'Research data' },
    why: { id: 'Tanpa nama. Opsional.', en: 'Without names. Optional.' },
    shared: [{ id: 'Data tanpa nama dan tanpa alamat (anonim)', en: 'Data without name or address (anonymised)' }],
    who: { id: 'Tim peneliti yang disetujui.', en: 'Approved research teams.' },
    details: {
      id: 'Tidak memengaruhi layanan untuk anak Anda. Anda tetap bisa memakai semua fitur walaupun ini dimatikan.',
      en: "Doesn't change the care your child receives. All features still work if this is off.",
    },
  },
];

/** One permission: a switch with a short title and one line. */
function PermissionRow({ c, value, onChange, last }: { c: Category; value: boolean; onChange: (v: boolean) => void; last: boolean }) {
  const { lang } = useAuth();
  const required = c.scope === 'data_processing';
  return (
    <View style={{ paddingVertical: 6, borderBottomWidth: last ? 0 : 1, borderColor: colors.line }}>
      <Row style={{ gap: 10 }}>
        <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Toggle label={c.title[lang]} value={value} onChange={onChange} disabled={required} />
        </View>
      </Row>
      <Text style={{ color: colors.muted, fontSize: 13, marginLeft: 36, marginTop: -4, marginBottom: 4 }}>{c.why[lang]}</Text>
    </View>
  );
}

/** The long version, only when asked: what is shared, with whom, and what switching off means. */
function DataUse() {
  const { t, lang } = useAuth();
  return (
    <Card>
      {CATEGORIES.map((c, i) => (
        <View key={c.scope} style={{ gap: 4, marginTop: i ? 16 : 0 }}>
          <Text style={{ fontWeight: '800' }}>
            {c.emoji} {c.title[lang]}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{t('whatIsShared')}: </Text>
            {c.shared.map((x) => x[lang]).join(', ')}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>{t('sharedWith')}: </Text>
            {c.who[lang]}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{c.details[lang]}</Text>
        </View>
      ))}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 16 }}>🛡️ {t('yourRightsText')}</Text>
    </Card>
  );
}

export default function Privacy() {
  const { t } = useAuth();
  const consents = useApi<Consents>('/api/consents');
  // The Puskesmas link is a consent too: shown here so every permission lives in one place.
  const preg = useApi<Pregnancy[]>('/api/pregnancies');
  const p = preg.data?.find((x) => x.status === 'active');
  const link = useApi<FacilityLink>(p ? `/api/pregnancies/${p.id}/link` : null);
  const [draft, setDraft] = useState<Partial<Consents>>({});
  const [learn, setLearn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = consents.data ? { ...consents.data, ...draft } : null;
  const changed = consents.data ? (Object.keys(draft) as Scope[]).filter((k) => draft[k] !== consents.data![k]) : [];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let last: Consents | null = null;
      for (const scope of changed) last = await api<Consents>('/api/consents', { body: { scope, granted: draft[scope] } });
      if (last) consents.setData(last);
      setDraft({});
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error && <ErrorBox message={error} />}
      {consents.error && <ErrorBox message={consents.error} onRetry={consents.reload} />}
      {p && link.data && (
        <Card>
          <ListRow
            emoji="🏥"
            title={t('flResultsTitle')}
            subtitle={link.data.enabled ? `${t('flOn')}${link.data.code ? ` · ${link.data.code}` : ''}` : t('flOff')}
            onPress={() => router.push(link.data!.enabled ? `/pregnancy/${p.id}/puskesmas` : `/pregnancy/${p.id}`)}
          />
        </Card>
      )}
      {!current ? (
        <Loading />
      ) : (
        <Card>
          {CATEGORIES.map((c, i) => (
            <PermissionRow
              key={c.scope}
              c={c}
              value={current[c.scope]}
              last={i === CATEGORIES.length - 1}
              onChange={(v) => {
                setSaved(false);
                setDraft((d) => ({ ...d, [c.scope]: v }));
              }}
            />
          ))}
        </Card>
      )}
      <MoreLink label={t('learnDataUse')} open={learn} onPress={() => setLearn(!learn)} />
      {learn && <DataUse />}
      {saved && !changed.length && <Text style={{ color: colors.ok, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>✓ {t('savedChanges')}</Text>}
      <Button title={t('save')} icon="checkmark" onPress={save} loading={busy} disabled={!changed.length} />
    </Screen>
  );
}
