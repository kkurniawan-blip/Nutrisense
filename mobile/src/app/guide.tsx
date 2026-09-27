import React from 'react';
import { View } from 'react-native';

import { Text } from '../components/Text';
import { Card, H2, Row, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';
import { statusColor } from '../theme';

const SECTIONS = {
  id: [
    {
      emoji: '🚨', title: 'Segera ke Puskesmas jika anak:', status: 'urgent' as const,
      items: ['Kejang', 'Tidak bisa minum atau menyusu', 'Muntah terus, semua yang diminum keluar', 'Sangat lemas atau sulit dibangunkan', 'Napas cepat atau sesak', 'BAB berdarah', 'Bengkak di kedua kaki'],
    },
    {
      emoji: '📏', title: 'Pantau pertumbuhan', status: 'info' as const,
      items: ['Timbang dan ukur setiap bulan di Posyandu', 'Bawa buku KIA setiap kali ke Posyandu', 'Perhatikan tren: berat dan tinggi harus terus naik'],
    },
    {
      emoji: '🍽️', title: 'Makan sehat setiap hari', status: 'ok' as const,
      items: ['ASI eksklusif sampai 6 bulan, lanjutkan sampai 2 tahun', 'Mulai MPASI di usia 6 bulan', 'Protein hewani setiap hari: telur, ikan, hati ayam', 'Targetkan 5 kelompok makanan per hari'],
    },
    {
      emoji: '🧼', title: 'Cegah penyakit', status: 'ok' as const,
      items: ['Cuci tangan pakai sabun sebelum makan dan menyuapi', 'Minum air yang sudah dimasak', 'Imunisasi lengkap sesuai jadwal', 'Obat cacing dan vitamin A sesuai jadwal Posyandu'],
    },
  ],
  en: [
    {
      emoji: '🚨', title: 'Go to the Puskesmas now if the child:', status: 'urgent' as const,
      items: ['Has convulsions', 'Cannot drink or breastfeed', 'Vomits everything', 'Is very weak or hard to wake', 'Breathes fast or with difficulty', 'Has blood in the stool', 'Has swelling of both feet'],
    },
    {
      emoji: '📏', title: 'Monitor growth', status: 'info' as const,
      items: ['Weigh and measure every month at the Posyandu', 'Bring the KIA (maternal & child health) book every visit', 'Watch the trend: weight and height should keep going up'],
    },
    {
      emoji: '🍽️', title: 'Eat well every day', status: 'ok' as const,
      items: ['Exclusive breastfeeding to 6 months, continue to 2 years', 'Start complementary food at 6 months', 'Animal protein every day: egg, fish, chicken liver', 'Aim for 5 food groups a day'],
    },
    {
      emoji: '🧼', title: 'Prevent illness', status: 'ok' as const,
      items: ['Wash hands with soap before eating and feeding', 'Drink boiled water', 'Complete immunisations on schedule', 'Deworming and vitamin A as scheduled at the Posyandu'],
    },
  ],
};

/** Plain health guidance (WHO/Kemenkes basics) that works offline: no data, no AI. */
export default function Guide() {
  const { lang } = useAuth();
  return (
    <Screen>
      {SECTIONS[lang].map((s) => {
        const c = statusColor[s.status];
        return (
          <Card key={s.title} tint={s.status === 'urgent' ? c.bg : undefined}>
            <H2 emoji={s.emoji}>{s.title}</H2>
            {s.items.map((i) => (
              <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.fg, marginTop: 8 }} />
                <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, fontWeight: s.status === 'urgent' ? '700' : '400' }}>{i}</Text>
              </Row>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}
