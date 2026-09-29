import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../../components/Text';
import { TodayBox } from '../../../components/TodayBox';
import { Bar, Bubble, Card, ErrorBox, H2, Loading, Row, Screen, StatusPill } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import type { Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

/** TTD & PMT ibu hamil: today's two ticks, the last seven days, and the running total of iron tablets. */
export default function Supplements() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const q = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  const [error, setError] = useState<string | null>(null);
  const p = q.data;
  if (!p) return <Screen>{q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;

  const set = async (body: { ttd?: boolean; pmt?: boolean }) => {
    setError(null);
    try {
      q.setData(await api<Pregnancy>(`/api/pregnancies/${id}/daily`, { body }));
    } catch (e) {
      setError(errorText(e));
    }
  };
  const dayName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { weekday: 'short' });

  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <Bubble mood="happy">{t('ttdBubble')}</Bubble>
      {error && <ErrorBox message={error} />}

      <Row style={{ gap: 10, marginBottom: 16, alignItems: 'stretch' }}>
        <TodayBox emoji="💊" title={t('ttdToday')} on={p.today_log.ttd} onPress={() => set({ ttd: !p.today_log.ttd })} />
        <TodayBox emoji="🍪" title={t('pmtToday')} on={p.today_log.pmt} note={p.pmt_needed ? t('pmtForKek') : undefined} onPress={() => set({ pmt: !p.today_log.pmt })} />
      </Row>

      <Card>
        <H2>{t('last7Days')}</H2>
        {(['ttd', 'pmt'] as const).map((k) => (
          <Row key={k} style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ width: 40, fontSize: 13, fontWeight: '700', color: colors.muted }}>{k.toUpperCase()}</Text>
            {p.daily_week.map((d) => (
              <View key={d.day} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: d[k] ? colors.mint : colors.line }}>
                {d[k] ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
              </View>
            ))}
          </Row>
        ))}
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ width: 40 }} />
          {p.daily_week.map((d) => (
            <Text key={d.day} style={{ width: 30, textAlign: 'center', fontSize: 11, color: colors.muted }}>
              {dayName(d.day)}
            </Text>
          ))}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontWeight: '800' }}>
            {t('ttdTaken')}: <Text style={{ fontSize: 20, fontWeight: '900' }}>{p.ttd_total}</Text>
          </Text>
          <StatusPill status={p.ttd_total >= 90 ? 'ok' : 'monitor'} label={t('ttdTarget')} />
        </Row>
        <Bar pct={(p.ttd_total / 90) * 100} color={colors.mint} warnBelow={0} />
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>💡 {t('ttdTip')}</Text>
      </Card>
    </Screen>
  );
}
