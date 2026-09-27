import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { AssessmentView, fmtZ } from '../../../components/AssessmentView';
import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { Text } from '../../../components/Text';
import { Badge, Button, Card, ErrorBox, H2, Loading, P, RiskBadge, Row, Screen, Tile } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { isStaff, useAuth } from '../../../lib/auth';
import { childEmoji, formatAge, medianAt, stickers } from '../../../lib/fun';
import type { Child, Meal, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

function ZTile({ emoji, title, z, cls }: { emoji: string; title: string; z: number | null; cls: string }) {
  const bad = z !== null && z < -2;
  const warn = z !== null && z < -1 && !bad;
  const fg = bad ? colors.danger : warn ? colors.warn : colors.ok;
  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 10, borderRadius: 18, backgroundColor: bad ? colors.dangerSoft : warn ? colors.warnSoft : colors.okSoft }}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{title}</Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: fg }}>{fmtZ(z)}</Text>
      <Text style={{ fontSize: 10, color: colors.muted }}>{cls.replace(/_/g, ' ')}</Text>
    </View>
  );
}

/** Two playful bars: the child's height next to the WHO average for the same age. */
function PeerBars({ height, median, name }: { height: number; median: number; name: string }) {
  const { t } = useAuth();
  const max = Math.max(height, median) * 1.08;
  const bar = (value: number, color: string, label: string, emoji: string) => (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontWeight: '900', color }}>{value.toFixed(1)} cm</Text>
      <View style={{ height: 130, justifyContent: 'flex-end', width: 54 }}>
        <View style={{ height: (value / max) * 130, backgroundColor: color, borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center', paddingTop: 6 }}>
          <Text style={{ fontSize: 22 }}>{emoji}</Text>
        </View>
      </View>
      <Text style={{ fontWeight: '700', marginTop: 4 }}>{label}</Text>
    </View>
  );
  return (
    <Row style={{ alignItems: 'flex-end', paddingTop: 4 }}>
      {bar(height, colors.primary, name, '🧒')}
      {bar(median, colors.mint, t('average'), '📏')}
    </Row>
  );
}

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, t, lang } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const chart = useApi<ChartData>(`/api/children/${id}/growth-chart`);
  const measurements = useApi<Measurement[]>(`/api/children/${id}/measurements`);
  const meals = useApi<Meal[]>(`/api/children/${id}/meals?limit=100`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const c = child.data;
  const a = c?.latest_assessment;
  const m = c?.latest_measurement;
  const trend = a?.trend;
  const mom = user?.role === 'caregiver';

  const reload = () => [child, chart, measurements, meals].forEach((x) => void x.reload());

  const exportFhir = async () => {
    try {
      const b = await api<{ entry: { resource: { resourceType: string } }[] }>(`/api/children/${id}/fhir`);
      const counts: Record<string, number> = {};
      b.entry.forEach((e) => (counts[e.resource.resourceType] = (counts[e.resource.resourceType] ?? 0) + 1));
      setMsg(`FHIR R4 Bundle: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const syncSatusehat = async () => {
    try {
      const r = await api<{ status: string; resources: number }>(`/api/children/${id}/fhir/sync`, { method: 'POST' });
      setMsg(`SATUSEHAT: ${r.status} (${r.resources})`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api(`/api/children/${id}`, { method: 'DELETE' });
      router.back();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(t('deleteConfirm'))) void doDelete();
      return;
    }
    Alert.alert(t('deleteChild'), t('deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteChild'), style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  if (!c) return <Screen>{child.error ? <ErrorBox message={child.error} onRetry={child.reload} /> : <Loading />}</Screen>;

  const girl = c.sex === 'female';
  const median = m ? medianAt(chart.data?.reference, m.age_months) : null;
  const earned = stickers(meals.data ?? [], measurements.data ?? [], lang);
  const firstName = c.name.split(' ')[0];

  return (
    <Screen refreshing={child.loading} onRefresh={reload}>
      <Stack.Screen options={{ title: c.name }} />
      <Card tint={girl ? colors.pinkSoft : colors.skySoft}>
        <Row style={{ gap: 14 }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 4,
              borderColor: girl ? colors.pink : colors.sky,
            }}
          >
            <Text style={{ fontSize: 40 }}>{childEmoji(c.sex, c.age_months)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '900' }}>{c.name}</Text>
            <Text style={{ color: colors.muted, marginBottom: 6 }}>
              🎂 {formatAge(c.age_months, lang)} · 📍 {c.region?.name}
            </Text>
            <RiskBadge level={a?.risk_level} />
          </View>
        </Row>
        {m && (
          <Row style={{ marginTop: 14, gap: 8 }}>
            <ZTile emoji="📏" title={lang === 'id' ? 'Tinggi/umur' : 'Height/age'} z={m.haz} cls={m.haz_class} />
            <ZTile emoji="⚖️" title={lang === 'id' ? 'Berat/umur' : 'Weight/age'} z={m.waz} cls={m.waz_class} />
            <ZTile emoji="🍽️" title={lang === 'id' ? 'Berat/tinggi' : 'Weight/height'} z={m.whz} cls={m.whz_class} />
          </Row>
        )}
      </Card>

      <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Tile emoji="📸" title={t('tileScan')} subtitle={t('tileScanSub')} color={0} onPress={() => router.push(`/child/${id}/meal?action=camera`)} />
        <Tile emoji="📏" title={t('tileMeasure')} subtitle={t('tileMeasureSub')} color={4} onPress={() => router.push(`/child/${id}/measure`)} />
        <Tile emoji="🌡️" title={t('tileSymptom')} subtitle={t('tileSymptomSub')} color={5} onPress={() => router.push(`/child/${id}/symptoms`)} />
        <Tile emoji="🥗" title={t('tileNutrition')} subtitle={t('tileNutritionSub')} color={1} onPress={() => router.push(`/child/${id}/nutrition`)} />
      </Row>

      {mom && (
        <Card>
          <H2 emoji="🏅">{t('stickersTitle')}</H2>
          <Row style={{ justifyContent: 'space-between' }}>
            {earned.map((s) => (
              <View key={s.key} style={{ alignItems: 'center', flex: 1, opacity: s.earned ? 1 : 0.35 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: s.earned ? colors.accentSoft : '#F3ECE8',
                    borderWidth: 3,
                    borderColor: s.earned ? colors.accent : '#E6D9D2',
                    borderStyle: s.earned ? 'solid' : 'dashed',
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{s.emoji}</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>{s.title}</Text>
              </View>
            ))}
          </Row>
        </Card>
      )}

      {m && median && (
        <Card>
          <H2 emoji="🦒">{t('vsPeers')}</H2>
          <PeerBars height={m.height_cm} median={median} name={firstName} />
        </Card>
      )}

      {a && <AssessmentView a={a} />}

      {trend && trend.status !== 'no_data' && (
        <Card>
          <H2 emoji="📈">{t('trend')}</H2>
          <Badge
            text={t(`trend_${trend.status}`)}
            fg={['projected_stunting', 'declining'].includes(trend.status) ? colors.danger : colors.ok}
            bg={['projected_stunting', 'declining'].includes(trend.status) ? colors.dangerSoft : colors.okSoft}
          />
          {trend.projections?.map((p) => (
            <P key={p.age_months} muted style={{ marginTop: 6 }}>
              🔮 {t('projectedIn')} {formatAge(p.age_months, lang)}: ~{p.expected_height_cm} cm ({t('average')} {p.median_height_cm} cm)
            </P>
          ))}
        </Card>
      )}

      {chart.data && chart.data.points.length > 0 && (
        <Card>
          <H2 emoji="🌱">{t('growthStory')}</H2>
          <GrowthChart data={chart.data} />
        </Card>
      )}

      <Card>
        <H2 emoji="🗓️">{t('history')}</H2>
        {[...(measurements.data ?? [])].reverse().map((x) => (
          <Row key={x.id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={{ width: 92, fontWeight: '700' }}>{x.measured_at}</Text>
            <Text style={{ color: colors.muted, flex: 1 }}>
              📏 {x.height_cm} · ⚖️ {x.weight_kg}
            </Text>
            <Text style={{ color: x.haz !== null && x.haz < -2 ? colors.danger : colors.text, fontWeight: '800' }}>{fmtZ(x.haz)}</Text>
          </Row>
        ))}
      </Card>

      <Card>
        <H2 emoji="🔒">{t('consents')}</H2>
        <Button small variant="ghost" title={t('exportData')} icon="document-text-outline" onPress={exportFhir} />
        {isStaff(user) && <Button small variant="ghost" title="SATUSEHAT sync (FHIR)" icon="cloud-upload-outline" onPress={syncSatusehat} />}
        {(user?.role === 'caregiver' || user?.role === 'admin') && (
          <Button small variant="danger" title={t('deleteChild')} icon="trash-outline" onPress={confirmDelete} loading={busy} />
        )}
        {msg && <P muted>{msg}</P>}
      </Card>
    </Screen>
  );
}
