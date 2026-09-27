import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';

import { AssessmentView, fmtZ } from '../../../components/AssessmentView';
import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { Badge, Button, Card, ErrorBox, H2, Loading, P, RiskBadge, Row, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { isStaff, useAuth } from '../../../lib/auth';
import type { Child, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

function ZTile({ title, z, cls }: { title: string; z: number | null; cls: string }) {
  const bad = z !== null && z < -2;
  const warn = z !== null && z < -1 && !bad;
  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 10, backgroundColor: bad ? colors.dangerSoft : warn ? colors.warnSoft : colors.okSoft }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{title}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: bad ? colors.danger : warn ? colors.warn : colors.ok }}>{fmtZ(z)}</Text>
      <Text style={{ fontSize: 11, color: colors.muted }}>{cls.replace(/_/g, ' ')}</Text>
    </View>
  );
}

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, t } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const chart = useApi<ChartData>(`/api/children/${id}/growth-chart`);
  const measurements = useApi<Measurement[]>(`/api/children/${id}/measurements`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const c = child.data;
  const a = c?.latest_assessment;
  const m = c?.latest_measurement;
  const trend = a?.trend;

  const reload = () => {
    void child.reload();
    void chart.reload();
    void measurements.reload();
  };

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

  return (
    <Screen refreshing={child.loading} onRefresh={reload}>
      <Stack.Screen options={{ title: c.name }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{c.name}</Text>
            <P muted>
              {t(c.sex)} · {Math.floor(c.age_months)} {t('months')} · {c.region?.name}
            </P>
          </View>
          <RiskBadge level={a?.risk_level} />
        </Row>
        {m && (
          <>
            <P muted style={{ marginTop: 8 }}>
              {t('latest')}: {m.measured_at} · {m.height_cm} cm · {m.weight_kg} kg
            </P>
            <Row style={{ marginTop: 8 }}>
              <ZTile title="TB/U · HAZ" z={m.haz} cls={m.haz_class} />
              <ZTile title="BB/U · WAZ" z={m.waz} cls={m.waz_class} />
              <ZTile title="BB/TB · WHZ" z={m.whz} cls={m.whz_class} />
            </Row>
          </>
        )}
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Button title={t('addMeasurement')} icon="resize-outline" onPress={() => router.push(`/child/${id}/measure`)} />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Button title={t('reportSymptoms')} icon="thermometer-outline" variant="secondary" onPress={() => router.push(`/child/${id}/symptoms`)} />
        </View>
      </Row>
      <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Button title={t('nutritionPlan')} icon="nutrition-outline" variant="secondary" onPress={() => router.push(`/child/${id}/nutrition`)} />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Button title={t('logMeal')} icon="camera-outline" variant="secondary" onPress={() => router.push(`/child/${id}/meal`)} />
        </View>
      </Row>

      {a && <AssessmentView a={a} />}

      {trend && trend.status !== 'no_data' && (
        <Card>
          <H2>{t('trend')}</H2>
          <Badge
            text={t(`trend_${trend.status}`)}
            fg={['projected_stunting', 'declining'].includes(trend.status) ? colors.danger : colors.ok}
            bg={['projected_stunting', 'declining'].includes(trend.status) ? colors.dangerSoft : colors.okSoft}
          />
          {trend.projections?.map((p) => (
            <P key={p.age_months} muted>
              {t('projectedIn')} {Math.round(p.age_months)} {t('months')}: HAZ {fmtZ(p.haz)} · ~{p.expected_height_cm} cm (median {p.median_height_cm} cm)
            </P>
          ))}
        </Card>
      )}

      {chart.data && chart.data.points.length > 0 && (
        <Card>
          <H2>{t('growthChart')}</H2>
          <GrowthChart data={chart.data} />
        </Card>
      )}

      <Card>
        <H2>{t('history')}</H2>
        {[...(measurements.data ?? [])].reverse().map((x) => (
          <Row key={x.id} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, width: 92 }}>{x.measured_at}</Text>
            <Text style={{ color: colors.muted, flex: 1 }}>
              {x.height_cm} cm · {x.weight_kg} kg
            </Text>
            <Text style={{ color: x.haz !== null && x.haz < -2 ? colors.danger : colors.text, fontWeight: '600' }}>HAZ {fmtZ(x.haz)}</Text>
          </Row>
        ))}
      </Card>

      <Card>
        <H2>{t('consents')}</H2>
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
