import { router } from 'expo-router';
import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Card, ErrorBox, H2, Loading, MoreLink, P, RiskBadge, Row, Screen, Segmented, Source, Stat, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { FEATURE_LABELS, label } from '../../lib/i18n';
import type { SourceRef } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, fonts, statusColor } from '../../theme';
import { SyncBanner } from '../../components/SyncBanner';
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
  two_t: number;
  source: SourceRef;
  reference: { stunting_ntt: { value: number; label: string; year: number } };
}

interface Ref {
  value: number;
  label: string;
  year: number;
}

interface Mothers {
  active: number;
  delivered_12m: number;
  checked: number;
  not_checked: number;
  kek: { n: number; of: number; pct: number | null; reference: Ref };
  anemia: { n: number; of: number; pct: number | null; reference: Ref };
  k6: { n: number; of: number; pct: number | null };
  k1: { n: number; of: number; pct: number | null };
  source: SourceRef;
}

interface Flagged {
  rows: { kind: 'child' | 'mother'; id: number; name: string; region: string | null; flags: string[]; measured_at: string; measured_by: 'mother' | 'kader'; urgent: boolean }[];
  source: SourceRef;
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
  source: SourceRef;
  benchmark_source: SourceRef;
}

interface ProjectionData {
  label: string;
  source: string;
  years: [number, number];
  target_source: string;
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
    /** The comparison model (since lr-3.0 a Random Forest; the shipped model is the logistic regression). */
    baseline?: { name: string; accuracy: number; f1_macro: number };
  };
  feature_importances: Record<string, number>;
  demo: boolean;
  source: SourceRef;
  trained_at: string;
}

function heatColor(idx: number | null) {
  if (idx === null) return '#D5D0EA';
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
      <Svg width={w} height={h} style={{ backgroundColor: '#EEF3FF', borderRadius: 16 }}>
        {rows.map((r) => {
          const radius = 10 + Math.sqrt(r.children) * 4;
          return (
            <React.Fragment key={r.region.id}>
              <Circle cx={sx(r.region.lng)} cy={sy(r.region.lat)} r={radius} fill={heatColor(r.risk_index)} opacity={0.55} />
              <Circle cx={sx(r.region.lng)} cy={sy(r.region.lat)} r={3} fill={colors.text} />
              <SvgText fontFamily={fonts.semibold} x={sx(r.region.lng)} y={sy(r.region.lat) - radius - 3} fontSize={10} fill={colors.text} textAnchor="middle">
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
        <SvgText fontFamily={fonts.semibold} x={w - pad.r} y={sy(d.target.value) - 4} fontSize={10} fill={colors.ok} textAnchor="end">
          target {d.target.value}% ({d.target.year})
        </SvgText>
        <Path d={line(d.history)} stroke={colors.primary} strokeWidth={2.5} fill="none" />
        <Path d={line([lastHist, ...d.projection])} stroke={colors.danger} strokeWidth={2} strokeDasharray="6 4" fill="none" />
        {pts.map((p) => (
          <Circle key={p.year} cx={sx(p.year)} cy={sy(p.value)} r={3} fill={p.proj ? colors.danger : colors.primary} />
        ))}
        {[x0, Math.round((x0 + x1) / 2), x1].map((x) => (
          <SvgText fontFamily={fonts.semibold} key={x} x={sx(x)} y={h - 6} fontSize={10} fill={colors.muted} textAnchor="middle">
            {x}
          </SvgText>
        ))}
        {[y0, y1].map((y) => (
          <SvgText fontFamily={fonts.semibold} key={y} x={pad.l - 4} y={sy(y) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
            {y}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export default function Dashboard() {
  const { t, user, lang } = useAuth();
  // The model's class names (low/medium/high) shown in the reader's language.
  const riskWord = (l: string) => (['low', 'medium', 'high'].includes(l) ? t(`risk_${l}`) : l);
  const summary = useApi<Summary>('/api/dashboard/summary');
  const heat = useApi<HeatRow[]>('/api/dashboard/heatmap');
  const [series, setSeries] = useState<'ntt' | 'indonesia'>('ntt');
  const proj = useApi<ProjectionData>(`/api/dashboard/projection?series=${series}`);
  const model = useApi<ModelInfo>('/api/dashboard/model');
  const mothers = useApi<Mothers>('/api/dashboard/mothers');
  const flagged = useApi<Flagged>('/api/dashboard/flagged');
  const priority = useApi<{ child_id: number; name: string; risk_level: 'low' | 'medium' | 'high'; urgency: string; region: string; top_reason: string }[]>(
    '/api/dashboard/priority?limit=8',
  );

  const [tech, setTech] = useState(false);
  const reload = () => [summary, heat, proj, model, priority, mothers, flagged].forEach((x) => void x.reload());
  const m = mothers.data;
  const s = summary.data;

  return (
    <Screen refreshing={summary.loading} onRefresh={reload}>
      <P muted style={{ marginBottom: 8 }}>
        {user?.full_name}
      </P>
      <SyncBanner stale={[summary, heat, proj, model, priority, mothers, flagged].some((x) => x.stale)} />
      {summary.error && <ErrorBox message={summary.error} onRetry={reload} />}
      {!s ? (
        <Loading />
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <Stat label={t('kpiChildren')} value={s.children} />
            <Stat label={t('kpiStunting')} value={s.stunting_prevalence_pct !== null ? `${s.stunting_prevalence_pct}%` : '–'} tone="warn" />
            <Stat label={t('kpiOpenCases')} value={s.open_cases} onPress={() => router.push('/cases')} />
          </Row>
          <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label={t('kpiEmergency')} value={s.emergency_cases} tone={s.emergency_cases ? 'danger' : 'ok'} onPress={() => router.push('/cases')} />
            <Stat label={t('kpiReview')} value={s.needs_review} tone={s.needs_review ? 'warn' : 'ok'} onPress={() => router.push('/cases')} />
            <Stat label={t('kpiDeclining')} value={s.declining_trend} tone="warn" />
          </Row>
          <Row style={{ flexWrap: 'wrap', marginBottom: 4 }}>
            <Stat label={t('kpiTwoT')} value={s.two_t} tone={s.two_t ? 'warn' : 'ok'} />
            <Stat label={`${t('kpiStuntingNtt')} (${s.reference.stunting_ntt.year})`} value={`${s.reference.stunting_ntt.value}%`} />
          </Row>
          <Source label={s.source.label} year={s.source.year} />
          <Source label={s.reference.stunting_ntt.label} year={s.reference.stunting_ntt.year} style={{ marginTop: 0, marginBottom: 12 }} />
          {/* Who needs help first, right under the numbers */}
          <Card>
            <H2>{t('priorityList')}</H2>
            {[...(priority.data ?? [])].sort((x, y) => Number(y.urgency === 'emergency') - Number(x.urgency === 'emergency')).map((p) => (
              <Card key={p.child_id} onPress={() => router.push(`/child/${p.child_id}`)} style={{ marginBottom: 8, padding: 12, ...(p.urgency === 'emergency' ? { borderColor: colors.danger, borderWidth: 2 } : {}) }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>
                    {p.name} · {p.region}
                  </Text>
                  <RiskBadge level={p.risk_level} />
                </Row>
                <Text style={{ color: p.urgency === 'emergency' ? colors.danger : colors.muted, fontSize: 13 }}>{t(`urgency_${p.urgency}`)}</Text>
              </Card>
            ))}
            <Source label={s.source.label} year={s.source.year} />
          </Card>
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
            <Source label={s.source.label} year={s.source.year} />
          </Card>
        </>
      )}

      {m && (
        <Card>
          <H2 emoji="🤰" right={<Text style={{ fontSize: 15, fontWeight: '800' }}>{m.active} {t('mothersCount')}</Text>}>
            {t('pregnantMothers')}
          </H2>
          <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <Stat label={`KEK (${m.kek.n}/${m.kek.of})`} value={m.kek.pct !== null ? `${m.kek.pct}%` : '–'} tone="warn" />
            <Stat label={`${t('anaemia')} (${m.anemia.n}/${m.anemia.of})`} value={m.anemia.pct !== null ? `${m.anemia.pct}%` : '–'} tone="warn" />
          </Row>
          <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <Stat label={`${t('k6Coverage')} (${m.k6.n}/${m.k6.of})`} value={m.k6.pct !== null ? `${m.k6.pct}%` : '–'} tone={(m.k6.pct ?? 0) >= 80 ? 'ok' : 'warn'} />
            <Stat label={`K1 (${m.k1.n}/${m.k1.of})`} value={m.k1.pct !== null ? `${m.k1.pct}%` : '–'} />
          </Row>
          {m.not_checked > 0 && <Text style={{ color: colors.muted, fontWeight: '700' }}>⚪ {m.not_checked} {t('mothersNotChecked')}</Text>}
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>{t('k6Def')}</Text>
          <Source label={m.source.label} year={m.source.year} />
          <Source label={`${t('national')}: KEK ${m.kek.reference.value}%, ${t('anaemia').toLowerCase()} ${m.anemia.reference.value}%, ${m.kek.reference.label}`} year={m.kek.reference.year} style={{ marginTop: 0 }} />
        </Card>
      )}

      {flagged.data && (
        <Card>
          <H2 emoji="⚠️" right={<Text style={{ fontSize: 15, fontWeight: '800' }}>{flagged.data.rows.length}</Text>}>
            {t('flaggedTitle')}
          </H2>
          {flagged.data.rows.slice(0, 8).map((r) => (
            <Card
              key={`${r.kind}${r.id}`}
              onPress={() => router.push(r.kind === 'child' ? `/child/${r.id}` : `/pregnancy/${r.id}`)}
              style={{ marginBottom: 8, padding: 12, ...(r.urgent ? { borderColor: colors.danger, borderWidth: 2 } : {}) }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', flex: 1 }}>
                  {r.kind === 'child' ? '👶' : '🤰'} {r.name}
                  {r.region ? <Text style={{ color: colors.muted, fontWeight: '400' }}> · {r.region}</Text> : null}
                </Text>
              </Row>
              <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {r.flags.map((f) => (
                  <StatusPill key={f} status={r.urgent ? 'urgent' : 'action'} label={t(`flag_${f}`)} />
                ))}
              </Row>
              <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
                {formatDate(r.measured_at, lang)} · {t('measuredBy')}: {r.measured_by === 'kader' ? 'Kader' : t('byMother')}
              </Text>
            </Card>
          ))}
          <Source label={flagged.data.source.label} year={flagged.data.source.year} />
        </Card>
      )}

      <Card>
        <H2>{t('heatmap')}</H2>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>
          👶 {t('childrenCount')} · 🔴 {t('risk_high')} · 🟠 {t('risk_medium')} · % {t('kpiStunting').toLowerCase()}
        </Text>
        {heat.data ? <HeatMap rows={heat.data} /> : <Loading />}
        {heat.data?.map((r) => (
          <Row key={r.region.id} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: heatColor(r.risk_index) }} />
            <Text style={{ flex: 1, color: colors.text }}>{r.region.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {r.children} · 🔴{r.risk.high} 🟠{r.risk.medium} · {r.measured_stunting_pct ?? '–'}% ({t('benchmark')} {r.benchmark_pct ?? '–'}%)
            </Text>
          </Row>
        ))}
        {heat.data?.[0] && (
          <>
            <Source label={heat.data[0].source.label} year={heat.data[0].source.year} />
            <Source label={`${t('benchmark')}: ${typeof heat.data[0].benchmark_source.label === 'string' ? heat.data[0].benchmark_source.label : heat.data[0].benchmark_source.label[lang]}`} year={heat.data[0].benchmark_source.year} style={{ marginTop: 0 }} />
          </>
        )}
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
            {tech && (
              <P muted style={{ fontSize: 12 }}>
                {t('projDegree')
                  .replace('{d}', String(proj.data.selected_degree))
                  .replace('{r}', Object.entries(proj.data.cv_rmse).map(([k, v]) => `${k.replace('degree_', 'd')}=${v}`).join(', '))}
              </P>
            )}
            <Source label={proj.data.source} year={`${proj.data.years[0]}–${proj.data.years[1]}`} />
            <Source label={`Target ${proj.data.target.value}% (${proj.data.target.year}): ${proj.data.target_source}`} style={{ marginTop: 0 }} />
          </>
        ) : (
          <Loading />
        )}
      </Card>

      {/* Model internals: for those who ask */}
      <MoreLink label={t('technicalDetails')} open={tech} onPress={() => setTech(!tech)} />
      {tech && model.data && (
        <Card>
          <H2 right={model.data.demo ? <StatusPill status="monitor" label={t('demoData')} /> : null}>{t('modelCard')}</H2>
          <P muted style={{ fontSize: 12 }}>{model.data.algorithm}</P>
          {model.data.demo && <Text style={{ color: statusColor.monitor.fg, fontSize: 13, fontWeight: '600' }}>{t('demoDataNote')}</Text>}
          <Row style={{ flexWrap: 'wrap', marginVertical: 8 }}>
            <Stat label={t('mAccuracy')} value={`${Math.round(model.data.metrics.accuracy * 100)}%`} />
            <Stat label={t('mF1')} value={model.data.metrics.f1_macro.toFixed(3)} />
            <Stat label={t('mFnrHigh')} value={`${Math.round(model.data.metrics.false_negative_rate_high * 100)}%`} tone="warn" />
          </Row>
          <P muted style={{ fontSize: 12 }}>
            {t('mBaseline')
              .replace('{name}', (model.data.metrics.baseline?.name ?? 'logistic_regression').replace('_', ' '))
              .replace('{acc}', ((model.data.metrics.baseline ?? model.data.metrics.baseline_logistic_regression).accuracy * 100).toFixed(1))
              .replace('{f1}', (model.data.metrics.baseline ?? model.data.metrics.baseline_logistic_regression).f1_macro.toFixed(3))}
          </P>
          <Text style={{ fontWeight: '700', marginTop: 8, color: colors.text }}>{t('mConfusion')}</Text>
          {model.data.metrics.confusion_matrix.matrix.map((row, i) => (
            <Row key={i}>
              <Text style={{ width: 100, color: colors.muted, fontSize: 13 }}>{riskWord(model.data!.metrics.confusion_matrix.labels[i])}</Text>
              {row.map((v, j) => (
                <Text key={j} style={{ width: 56, textAlign: 'right', fontWeight: i === j ? '800' : '400', color: i === j ? colors.ok : colors.text }}>
                  {v}
                </Text>
              ))}
            </Row>
          ))}
          <Text style={{ fontWeight: '700', marginTop: 12, color: colors.text }}>{t('modelInputs')}</Text>
          {Object.entries(model.data.feature_importances)
            .slice(0, 6)
            .map(([k, v]) => (
              <Row key={k} style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>{label(FEATURE_LABELS, k, lang)}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{(v * 100).toFixed(0)}%</Text>
              </Row>
            ))}
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>{t('modelNoHeight')}</Text>
          <Source label={model.data.source.label} year={model.data.source.year} />
        </Card>
      )}
    </Screen>
  );
}
