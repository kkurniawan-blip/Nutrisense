import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { Text } from '../../../components/Text';
import { Button, Card, Empty, ErrorBox, Loading, MoreLink, Row, Screen, Segmented, StatusPill } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import { zWords } from '../../../lib/status';
import type { Child, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor } from '../../../theme';

/** Dedicated growth history: trend graph + every measurement with date, height and weight. */
export default function History() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [ind, setInd] = useState<'hfa' | 'wfa' | 'wfh'>('hfa');
  const [learn, setLearn] = useState(false);
  const child = useApi<Child>(`/api/children/${id}`);
  const ms = useApi<Measurement[]>(`/api/children/${id}/measurements`);
  const chart = useApi<ChartData>(`/api/children/${id}/growth-chart?indicator=${ind}`);
  const rows = [...(ms.data ?? [])].reverse();
  const name = child.data?.name.split(' ')[0] ?? '';

  if (!ms.data) return <Screen>{ms.error ? <ErrorBox message={ms.error} onRetry={ms.reload} /> : <Loading />}</Screen>;
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
  // Weight that did not go up is a warning (as the 2T rule says), never shown in reassuring green.
  const notGaining = dW !== null && dW < 0.05;

  return (
    <Screen refreshing={ms.loading} onRefresh={() => [ms.reload(), chart.reload()]}>
      {/* Where the child is now, and the change since last time */}
      <View style={{ marginBottom: 18, gap: 2 }}>
        <Text style={{ fontSize: 15, color: colors.muted, fontWeight: '600' }}>
          {t('growthOf')} {name}
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '900' }}>
          {latest.height_cm} <Text style={{ fontSize: 15, color: colors.muted, fontWeight: '500' }}>cm</Text>
          <Text style={{ color: '#C9C4DD' }}> · </Text>
          {latest.weight_kg} <Text style={{ fontSize: 15, color: colors.muted, fontWeight: '500' }}>kg</Text>
        </Text>
        {dH !== null && dW !== null && (
          <Text style={{ fontSize: 14, color: notGaining ? statusColor.action.fg : colors.ok, fontWeight: '700' }}>
            {sign(dH)} cm · {sign(dW)} kg <Text style={{ color: colors.muted, fontWeight: '400' }}>{t('sinceLast').toLowerCase()}</Text>
            {notGaining ? ` · ${t('weightNotUp')}` : ''}
          </Text>
        )}
      </View>

      <Card>
        <Segmented
          value={ind}
          onChange={setInd}
          options={[
            { value: 'hfa', label: t('height_short') },
            { value: 'wfa', label: t('weight_short') },
            { value: 'wfh', label: t('bbtb_short') },
          ]}
        />
        {chart.data ? (
          <GrowthChart
            data={chart.data}
            labels={{ child: name, average: t('average'), lowerLimit: t('lowerLimit'), farBelow: t('farBelow'), projection: t('projectionLbl'), xAxis: chart.data.x_unit === 'cm' ? t('axisHeight') : t('axisAge') }}
          />
        ) : chart.error ? (
          <Text style={{ color: colors.muted, fontSize: 14, marginVertical: 12 }}>📶 {t('chartNeedsSignal')}</Text>
        ) : (
          <Loading />
        )}
        <MoreLink label={t('learnChart')} open={learn} onPress={() => setLearn(!learn)} />
        {learn && (
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            {chart.data?.meaning ? `${chart.data.meaning} ` : ''}
            {t('zExplain')}
          </Text>
        )}
      </Card>

      {/* Every measurement, one line each */}
      <Card>
        {rows.map((x, i) => (
          <Row key={x.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 14, fontWeight: i === 0 ? '700' : '400' }}>{formatDate(x.measured_at, lang)}</Text>
              <StatusPill status={zWords(x.haz, lang, 'height').key} label={zWords(x.haz, lang, 'height').text} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>
              {x.height_cm} cm · {x.weight_kg} kg
            </Text>
          </Row>
        ))}
      </Card>
      <Button title={t('tileMeasure')} icon="add-circle" onPress={() => router.push(`/child/${id}/measure`)} />
    </Screen>
  );
}
