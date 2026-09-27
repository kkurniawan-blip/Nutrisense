import { router } from 'expo-router';
import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Card, ErrorBox, H1, H2, Loading, P, RiskBadge, Row, Screen, Segmented, Stat } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';
import { Text } from '../../components/Text';

interface Summary {
  children: number;
  stunting_prevalence_pct: number | null;
  risk_distribution: { low: number; medium: number; high: number };
  needs_review: number;
  open_cases: number;
  emergency_cases: number;
  supply: Record<string, number>;
  restock_alerts: number;
  declining_trend: number;
}

interface HeatRow {
  region: { id: number; name: string; district: string; lat: number; lng: number };
  children: number;
  assessed: number;
  risk: { low: number; medium: number; high: number };
  risk_index: number | null;
  measured_stunting_pct: number | null;
  benchmark_pct: number | null;
  open_cases: number;
}

interface ProjectionData {
  label: string;
  source: string;
  target: { year: number; value: number };
  rmse: Record<string, number>;
  cv_rmse: Record<string, number>;
  selected_degree: number;
  history: { year: number; value: number }[];
  projection: { year: number; value: number }[];
}

interface ModelInfo {
  algorithm: string;
  n_samples: number;
  metrics: {
    accuracy: number;
    f1_macro: number;
    precision_macro: number;
    recall_macro: number;
    false_negative_rate_high: number;
    confusion_matrix: { labels: string[]; matrix: number[][] };
    baseline_logistic_regression: { accuracy: number; f1_macro: number };
  };
  feature_importances: Record<string, number>;
}

function heatColor(idx: number | null) {
  if (idx === null) return '#CBD5D1';
  if (idx >= 0.5) return colors.danger;
  if (idx >= 0.3) return colors.accent;
  return colors.ok;
}

function HeatMap({ rows }: { rows: HeatRow[] }) {
  const [w, setW] = useState(320);
  const h = 220;
  const lats = rows.map((r) => r.region.lat);
  const lngs = rows.map((r) => r.region.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const pad = 36;
  const sx = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng || 1)) * (w - 2 * pad);
  const sy = (lat: number) => pad + ((maxLat - lat) / (maxLat - minLat || 1)) * (h - 2 * pad);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={h} style={{ backgroundColor: '#EAF3F7', borderRadius: 12 }}>
        {rows.map((r) => {
          const radius = 10 + Math.sqrt(r.children) * 4;
          return (
            <React.Fragment key={r.region.id}>
              <Circle cx={sx(r.region.lng)} cy={sy(r.region.lat)} r={radius} fill={heatColor(r.risk_index)} opacity={0.55} />
              <Circle cx={sx(r.region.lng)} cy={sy(r.region.lat)} r={3} fill={colors.text} />
              <SvgText x={sx(r.region.lng)} y={sy(r.region.lat) - radius - 3} fontSize={10} fill={colors.text} textAnchor="middle">
                {r.region.name.split(' (')[0]}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function ProjectionChart({ d }: { d: ProjectionData }) {
  const [w, setW] = useState(320);
  const h = 180;
  const pts = [...d.history.map((p) => ({ ...p, proj: false })), ...d.projection.map((p) => ({ ...p, proj: true }))];
  const xs = pts.map((p) => p.year);
  const ys = [...pts.map((p) => p.value), d.target.value];
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs, d.target.year), Math.floor(Math.min(...ys) - 2), Math.ceil(Math.max(...ys) + 2)];
  const pad = { l: 30, r: 10, t: 10, b: 22 };
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (h - pad.t - pad.b);
  const line = (arr: { year: number; value: number }[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${sx(p.year)},${sy(p.value)}`).join(' ');
  const lastHist = d.history[d.history.length - 1];
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={h}>
        <Line x1={pad.l} x2={w - pad.r} y1={sy(d.target.value)} y2={sy(d.target.value)} stroke={colors.ok} strokeDasharray="4 4" />
        <SvgText x={w - pad.r} y={sy(d.target.value) - 4} fontSize={10} fill={colors.ok} textAnchor="end">
          target {d.target.value}% ({d.target.year})
        </SvgText>
        <Path d={line(d.history)} stroke={colors.primaryDark} strokeWidth={2.5} fill="none" />
        <Path d={line([lastHist, ...d.projection])} stroke={colors.danger} strokeWidth={2} strokeDasharray="6 4" fill="none" />
        {pts.map((p) => (
          <Circle key={p.year} cx={sx(p.year)} cy={sy(p.value)} r={3} fill={p.proj ? colors.danger : colors.primaryDark} />
        ))}
        {[x0, Math.round((x0 + x1) / 2), x1].map((x) => (
          <SvgText key={x} x={sx(x)} y={h - 6} fontSize={10} fill={colors.muted} textAnchor="middle">
            {x}
          </SvgText>
        ))}
        {[y0, y1].map((y) => (
          <SvgText key={y} x={pad.l - 4} y={sy(y) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
            {y}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export default function Dashboard() {
  const { t, user } = useAuth();
  const summary = useApi<Summary>('/api/dashboard/summary');
  const heat = useApi<HeatRow[]>('/api/dashboard/heatmap');
  const [series, setSeries] = useState<'ntt' | 'indonesia'>('ntt');
  const proj = useApi<ProjectionData>(`/api/dashboard/projection?series=${series}`);
  const model = useApi<ModelInfo>('/api/dashboard/model');
  const priority = useApi<{ child_id: number; name: string; risk_level: 'low' | 'medium' | 'high'; urgency: string; region: string; top_reason: string }[]>(
    '/api/dashboard/priority?limit=8',
  );

  const reload = () => [summary, heat, proj, model, priority].forEach((x) => void x.reload());
  const s = summary.data;

  return (
    <Screen refreshing={summary.loading} onRefresh={reload}>
      <H1>{t('dashboard')}</H1>
      <P muted style={{ marginBottom: 8 }}>
        {user?.full_name}
      </P>
      {summary.error && <ErrorBox message={summary.error} onRetry={reload} />}
      {!s ? (
        <Loading />
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <Stat label={t('kpiChildren')} value={s.children} />
            <Stat label={t('kpiStunting')} value={s.stunting_prevalence_pct !== null ? `${s.stunting_prevalence_pct}%` : '–'} tone="warn" />
            <Stat label={t('kpiOpenCases')} value={s.open_cases} />
          </Row>
          <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label={t('kpiEmergency')} value={s.emergency_cases} tone={s.emergency_cases ? 'danger' : 'ok'} />
            <Stat label={t('kpiReview')} value={s.needs_review} tone={s.needs_review ? 'warn' : 'ok'} />
            <Stat label={t('kpiDeclining')} value={s.declining_trend} tone="warn" />
          </Row>
          <Card>
            <H2>{t('risk')}</H2>
            <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden' }}>
              {(['low', 'medium', 'high'] as const).map((k) => (
                <View
                  key={k}
                  style={{ flex: s.risk_distribution[k] || 0.0001, backgroundColor: k === 'low' ? colors.ok : k === 'medium' ? colors.accent : colors.danger }}
                />
              ))}
            </View>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              {(['low', 'medium', 'high'] as const).map((k) => (
                <Text key={k} style={{ color: colors.muted, fontSize: 12 }}>
                  {t(`risk_${k}`)}: {s.risk_distribution[k]}
                </Text>
              ))}
            </Row>
          </Card>
        </>
      )}

      <Card>
        <H2>{t('priorityList')}</H2>
        {(priority.data ?? []).map((p) => (
          <Card key={p.child_id} onPress={() => router.push(`/child/${p.child_id}`)} style={{ marginBottom: 8, padding: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>
                {p.name} · {p.region}
              </Text>
              <RiskBadge level={p.risk_level} />
            </Row>
            <Text style={{ color: p.urgency === 'emergency' ? colors.danger : colors.muted, fontSize: 13 }}>{t(`urgency_${p.urgency}`)}</Text>
          </Card>
        ))}
      </Card>

      <Card>
        <H2>{t('heatmap')}</H2>
        {heat.data ? <HeatMap rows={heat.data} /> : <Loading />}
        {heat.data?.map((r) => (
          <Row key={r.region.id} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: heatColor(r.risk_index) }} />
            <Text style={{ flex: 1, color: colors.text }}>{r.region.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {r.children} · H{r.risk.high}/M{r.risk.medium} · {r.measured_stunting_pct ?? '–'}% ({t('benchmark')} {r.benchmark_pct ?? '–'}%)
            </Text>
          </Row>
        ))}
      </Card>

      <Card>
        <H2>{t('projection')}</H2>
        <Segmented
          value={series}
          onChange={setSeries}
          options={[
            { value: 'ntt', label: 'NTT' },
            { value: 'indonesia', label: 'Indonesia' },
          ]}
        />
        {proj.data ? (
          <>
            <ProjectionChart d={proj.data} />
            <P muted style={{ fontSize: 12 }}>
              Poly degree {proj.data.selected_degree} · LOOCV RMSE {Object.entries(proj.data.cv_rmse).map(([k, v]) => `${k.replace('degree_', 'd')}=${v}`).join(', ')}
            </P>
            <P muted style={{ fontSize: 11 }}>{proj.data.source}</P>
          </>
        ) : (
          <Loading />
        )}
      </Card>

      {model.data && (
        <Card>
          <H2>{t('modelCard')}</H2>
          <P muted style={{ fontSize: 12 }}>{model.data.algorithm}</P>
          <Row style={{ flexWrap: 'wrap', marginVertical: 8 }}>
            <Stat label="Accuracy" value={`${(model.data.metrics.accuracy * 100).toFixed(1)}%`} />
            <Stat label="F1 (macro)" value={model.data.metrics.f1_macro.toFixed(3)} />
            <Stat label="FNR (high)" value={`${(model.data.metrics.false_negative_rate_high * 100).toFixed(1)}%`} tone="warn" />
          </Row>
          <P muted style={{ fontSize: 12 }}>
            Baseline logistic regression: acc {(model.data.metrics.baseline_logistic_regression.accuracy * 100).toFixed(1)}%, F1{' '}
            {model.data.metrics.baseline_logistic_regression.f1_macro.toFixed(3)}
          </P>
          <Text style={{ fontWeight: '700', marginTop: 8, color: colors.text }}>Confusion matrix (rows = true)</Text>
          {model.data.metrics.confusion_matrix.matrix.map((row, i) => (
            <Row key={i}>
              <Text style={{ width: 70, color: colors.muted }}>{model.data!.metrics.confusion_matrix.labels[i]}</Text>
              {row.map((v, j) => (
                <Text key={j} style={{ width: 56, textAlign: 'right', fontWeight: i === j ? '800' : '400', color: i === j ? colors.ok : colors.text }}>
                  {v}
                </Text>
              ))}
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
