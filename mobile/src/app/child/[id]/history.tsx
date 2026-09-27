import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { Text } from '../../../components/Text';
import { Button, Card, Empty, H2, Loading, Row, Screen, Segmented, StatusPill } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import { zWords } from '../../../lib/status';
import type { Child, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

/** Dedicated growth history: trend graph + every measurement with date, height and weight. */
export default function History() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [ind, setInd] = useState<'hfa' | 'wfa'>('hfa');
  const child = useApi<Child>(`/api/children/${id}`);
  const ms = useApi<Measurement[]>(`/api/children/${id}/measurements`);
  const chart = useApi<ChartData>(`/api/children/${id}/growth-chart?indicator=${ind}`);
  const rows = [...(ms.data ?? [])].reverse();
  const name = child.data?.name.split(' ')[0] ?? '';

  if (!ms.data) return <Screen>{ms.loading ? <Loading /> : null}</Screen>;
  if (!rows.length)
    return (
      <Screen>
        <Empty text={t('noMeasurementYet')} />
        <Button title={t('tileMeasure')} icon="add-circle" onPress={() => router.push(`/child/${id}/measure`)} />
      </Screen>
    );

  const latest = rows[0];
  const prev = rows[1];
  const dH = prev ? latest.height_cm - prev.height_cm : null;
  const dW = prev ? latest.weight_kg - prev.weight_kg : null;
  const sign = (v: number) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

  return (
    <Screen refreshing={ms.loading} onRefresh={() => [ms.reload(), chart.reload()]}>
      <Card tint={colors.mintSoft}>
        <Text style={{ fontWeight: '900', color: colors.ok }}>{t('latestMeasurement')}</Text>
        <Text style={{ fontSize: 22, fontWeight: '900' }}>
          📏 {latest.height_cm} cm · ⚖️ {latest.weight_kg} kg
        </Text>
        <Text style={{ color: colors.muted }}>{formatDate(latest.measured_at, lang)}</Text>
        {dH !== null && dW !== null && (
          <Text style={{ marginTop: 4, fontWeight: '700' }}>
            {t('sinceLast')}: {sign(dH)} cm · {sign(dW)} kg
          </Text>
        )}
      </Card>

      <Card>
        <H2 emoji="📈">{t('growthTrend')}</H2>
        <Segmented
          value={ind}
          onChange={setInd}
          options={[
            { value: 'hfa', label: t('height_short') },
            { value: 'wfa', label: t('weight_short') },
          ]}
        />
        {chart.data ? (
          <GrowthChart
            data={chart.data}
            labels={{ child: name, average: t('average'), lowerLimit: t('lowerLimit'), farBelow: t('farBelow'), projection: t('projectionLbl'), xAxis: t('axisAge') }}
          />
        ) : (
          <Loading />
        )}
      </Card>

      <Card>
        <Row style={{ paddingBottom: 8, borderBottomWidth: 2, borderColor: colors.border }}>
          <Text style={{ flex: 1.3, fontWeight: '900', color: colors.muted }}>{t('date')}</Text>
          <Text style={{ flex: 1, fontWeight: '900', color: colors.muted }}>{t('height_short')}</Text>
          <Text style={{ flex: 1, fontWeight: '900', color: colors.muted }}>{t('weight_short')}</Text>
        </Row>
        {rows.map((x, i) => {
          const w = zWords(x.haz, lang, 'height');
          return (
            <View key={x.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: i === 0 ? '#FFFBF7' : undefined }}>
              <Row>
                <Text style={{ flex: 1.3, fontWeight: i === 0 ? '900' : '600' }}>
                  {formatDate(x.measured_at, lang)}
                  {i === 0 ? ` · ${t('newest')}` : ''}
                </Text>
                <Text style={{ flex: 1 }}>{x.height_cm} cm</Text>
                <Text style={{ flex: 1 }}>{x.weight_kg} kg</Text>
              </Row>
              <View style={{ marginTop: 4 }}>
                <StatusPill status={w.key} label={w.text} />
              </View>
            </View>
          );
        })}
      </Card>
      <Button title={t('tileMeasure')} icon="add-circle" onPress={() => router.push(`/child/${id}/measure`)} />
    </Screen>
  );
}
