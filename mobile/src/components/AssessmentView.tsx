import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { FEATURE_LABELS, label } from '../lib/i18n';
import { motherStatus, txt, zWords } from '../lib/status';
import type { Assessment, Facility } from '../lib/types';
import { colors, statusColor, StatusKey } from '../theme';
import { AudioButton } from './AudioButton';
import { Mascot } from './Mascot';
import { Escalation } from './SymptomTiles';
import { Text } from './Text';
import { Bar, Card, H2, ListRow, MoreLink, P, RiskBadge, Row, SourceTag, StatusPill } from './ui';

export function fmtZ(z: number | null | undefined) {
  return z === null || z === undefined ? '–' : `${z > 0 ? '+' : ''}${z.toFixed(1)}`;
}

const TREND: Record<string, { key: StatusKey; id: string; en: string }> = {
  projected_stunting: { key: 'action', id: 'Pertambahan tinggi melambat', en: 'Height gain is slowing' },
  declining: { key: 'monitor', id: 'Sedikit melambat', en: 'Slowing a little' },
  catching_up: { key: 'ok', id: 'Mulai mengejar', en: 'Catching up' },
  stable: { key: 'ok', id: 'Stabil', en: 'Stable' },
  insufficient_history: { key: 'unknown', id: 'Perlu lebih banyak pengukuran', en: 'Needs more measurements' },
  no_data: { key: 'unknown', id: 'Belum ada data', en: 'No data' },
};

/** A health worker's review, visually distinct from AI guidance. */
export function ProReviewCard({ a }: { a: Assessment }) {
  const { t, lang } = useAuth();
  if (!a.reviewed_at) return null;
  return (
    <Card tint={statusColor.info.bg}>
      <SourceTag kind="pro" />
      <Text style={{ fontWeight: '800', color: statusColor.info.fg }}>
        {t('reviewedBy')} {a.reviewed_by_name ?? '–'}
      </Text>
      <Text style={{ color: statusColor.info.fg, fontSize: 13 }}>{formatDate(a.reviewed_at, lang, true)}</Text>
      {a.review_note ? <P style={{ marginTop: 6 }}>“{a.review_note}”</P> : null}
    </Card>
  );
}

function FactorRow({ name, value, status }: { name: string; value: string; status: StatusKey }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ flex: 1, fontWeight: '700' }}>{name}</Text>
      <StatusPill status={status} label={value} />
    </Row>
  );
}

type Props = { a: Assessment; compact?: boolean; hideEmergency?: boolean; facility?: Facility | null; kaderPhone?: string | null };

function MotherResult({ a, compact, hideEmergency, facility, kaderPhone }: Props) {
  const { t, lang } = useAuth();
  const [why, setWhy] = useState(false);
  const st = motherStatus(a);
  const f = a.features as Record<string, number | null | string[]>;
  const codes = new Set(a.triage.actions.map((x) => x.code));
  const emergency = a.triage.urgency === 'emergency';
  const id = a.child_id;

  // One line each: an icon and a few words. The long triage text stays in "Kenapa?".
  const actions: { emoji: string; title: string; go?: () => void }[] = [];
  if (emergency) {
    actions.push({ emoji: '🏥', title: t('actGoNow') });
    if (codes.has('keep_breastfeeding')) actions.push({ emoji: '🤱', title: t('actKeepFeeding') });
  } else {
    actions.push({ emoji: '📏', title: codes.has('remeasure_2w') ? `${t('actMeasureNext')} · ${t('in2Weeks')}` : t('actMeasureNext'), go: () => router.push(`/child/${id}/measure`) });
    if (Number(f.age_months) < 6) actions.push({ emoji: '🤱', title: t('asiOnly'), go: () => router.push(`/child/${id}/asi`) });
    else actions.push({ emoji: '🍽️', title: t('actWatchMeals'), go: () => router.push(`/child/${id}/meal?action=manual`) });
    actions.push({ emoji: '📅', title: t('actFollowPlan'), go: () => router.push(`/child/${id}/nutrition`) });
    if (codes.has('ors_zinc')) actions.push({ emoji: '💊', title: t('actOrs') });
    actions.push({ emoji: '👩‍⚕️', title: t('actDiscuss') });
  }

  const diarrhea = f.diarrhea ? t('fDiarrhea') : f.fever ? t('fFever') : f.respiratory ? t('fCough') : null;
  const imputed = (f.imputed as string[] | undefined) ?? [];
  const trend = TREND[a.trend?.status ?? 'no_data'] ?? TREND.no_data;
  const hz = zWords(f.haz as number | null, lang, 'height');
  const wz = zWords(f.waz as number | null, lang, 'weight');
  // The one short explanation: the first growth sign that is not on track, in plain words.
  const line = emergency
    ? t('urgentSupportive')
    : hz.key !== 'ok' && hz.key !== 'unknown'
      ? `${t('height_short')} ${hz.text.toLowerCase()}.`
      : wz.key !== 'ok' && wz.key !== 'unknown'
        ? `${t('weight_short')} ${wz.text.toLowerCase()}.`
        : st.key === 'ok'
          ? t('celebrate')
          : t('supportive');

  return (
    <>
      {/* One red warning per screen: skip it when the screen already shows its own (e.g. symptom checker with a call button). */}
      {emergency && !hideEmergency && <Escalation facility={facility} phone={kaderPhone} />}

      <Card>
        <SourceTag kind="ai" />
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <Mascot size={54} mood={st.key === 'ok' ? 'cheer' : st.key === 'urgent' ? 'caring' : 'thinking'} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: statusColor[st.key].fg }}>{txt(emergency ? st.label : st.headline, lang)}</Text>
            <Text style={{ color: colors.muted }}>{line}</Text>
            <AudioButton text={`${txt(emergency ? st.label : st.headline, lang)}. ${line} ${actions.map((x) => x.title).join('. ')}`} />
          </View>
        </Row>
        {!compact && <MoreLink label={t('seeReasons')} open={why} onPress={() => setWhy(!why)} />}
        {why && (
          <View>
            <FactorRow name={t('fHeightAge')} value={hz.text} status={hz.key} />
            <FactorRow name={t('fWeightAge')} value={wz.text} status={wz.key} />
            <FactorRow name={t('fTrend')} value={trend[lang]} status={trend.key} />
            <FactorRow
              name={t('fWeightGain')}
              value={Number(f.weight_not_gaining) >= 2 ? t('twoT') : Number(f.weight_not_gaining) === 1 ? t('oneT') : t('gainOk')}
              status={Number(f.weight_not_gaining) >= 2 ? 'action' : Number(f.weight_not_gaining) === 1 ? 'monitor' : 'ok'}
            />
            <FactorRow
              name={t('fDiet')}
              value={imputed.includes('dietary_diversity') ? t('fNoMeals') : `${Math.round(Number(f.dietary_diversity))}/8 ${t('groups')}`}
              status={imputed.includes('dietary_diversity') ? 'unknown' : (f.dietary_diversity as number) >= 5 ? 'ok' : 'monitor'}
            />
            {diarrhea && <FactorRow name={t('fSymptoms')} value={diarrhea} status="monitor" />}
            <MoreLink label={t('analysisDetail')} onPress={() => router.push(`/child/${id}/analysis`)} />
          </View>
        )}
      </Card>

      <Card>
        <H2>{t('whatMomCanDo')}</H2>
        {actions.map((x) => (
          <ListRow key={x.title} emoji={x.emoji} title={x.title} onPress={x.go} right={x.go ? undefined : <View />} />
        ))}
      </Card>

      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 14 }}>{t('notDiagnosis')}</Text>
      <ProReviewCard a={a} />
    </>
  );
}

/** Z-scores, model confidence and feature contributions: only for those who want them. */
export function TechnicalDetails({ a }: { a: Assessment }) {
  const { t, lang } = useAuth();
  const f = a.features as Record<string, number | null>;
  const maxC = Math.max(...a.explanation.map((e) => Math.abs(e.contribution)), 0.01);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        HAZ {fmtZ(f.haz)} · WAZ {fmtZ(f.waz)} · WHZ {fmtZ(f.whz)} · {t('confidence')} {Math.round(a.confidence * 100)}%
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>
        P(low/med/high) = {Math.round(a.probabilities.low * 100)} / {Math.round(a.probabilities.medium * 100)} / {Math.round(a.probabilities.high * 100)}%
        {a.guardrail ? ` · ${a.guardrail}` : ''}
      </Text>
      {a.reasons.map((r) => (
        <Text key={r.code + r.text} style={{ fontSize: 14, marginBottom: 2 }}>
          • {r.text}
        </Text>
      ))}
      {a.explanation.map((e) => (
        <View key={e.feature} style={{ marginTop: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14 }}>{label(FEATURE_LABELS, e.feature, lang)}</Text>
            <Text style={{ color: e.contribution > 0 ? colors.danger : colors.ok, fontWeight: '800', fontSize: 14 }}>
              {e.contribution > 0 ? '▲' : '▼'} {Math.abs(e.contribution * 100).toFixed(0)}
            </Text>
          </Row>
          <Bar pct={(Math.abs(e.contribution) / maxC) * 100} color={e.contribution > 0 ? colors.primary : colors.mint} warnBelow={0} />
        </View>
      ))}
    </View>
  );
}

/** Staff keep the clinical view (level, urgency, confidence, factors), still labelled as AI output. */
function StaffResult({ a, compact, hideEmergency }: Props) {
  const { t, lang } = useAuth();
  const emergency = a.triage.urgency === 'emergency';
  return (
    <>
      {emergency && !hideEmergency && (
        <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
          <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 17 }}>🚨 {t('dangerTitle')}</Text>
          <Text style={{ marginTop: 6 }}>{a.triage.actions[0]?.text}</Text>
        </Card>
      )}
      <Card>
        <SourceTag kind="ai" />
        <Row style={{ justifyContent: 'space-between' }}>
          <RiskBadge level={a.risk_level} large clinical />
          <Text style={{ color: colors.muted, fontSize: 13 }}>{formatDate(a.created_at, lang, true)}</Text>
        </Row>
        <Text style={{ fontWeight: '800', marginTop: 6 }}>{t(`urgency_${a.triage.urgency}`)}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {t('confidence')} {Math.round(a.confidence * 100)}%{a.needs_review && !a.reviewed_at ? ` · ⏳ ${t('needsReview')}` : ''}
        </Text>
      </Card>
      <Card>
        <H2 emoji="🔍">{t('whyRisk')}</H2>
        {a.reasons.map((r) => (
          <P key={r.code + r.text}>• {r.text}</P>
        ))}
      </Card>
      <Card>
        <H2 emoji="🗺️">{t('whatToDo')}</H2>
        {a.triage.actions.map((x, i) => (
          <P key={x.code}>
            {i + 1}. {x.text}
          </P>
        ))}
        {a.triage.supplies.length > 0 && (
          <Text style={{ marginTop: 6, fontWeight: '700' }}>🎁 {a.triage.supplies.map((s) => `${s.quantity}× ${s.name}`).join(', ')}</Text>
        )}
        <P muted style={{ fontSize: 13, marginTop: 6 }}>{a.triage.disclaimer}</P>
      </Card>
      {!compact && (
        <Card>
          <H2 emoji="🤖">{t('aiFactors')}</H2>
          <TechnicalDetails a={a} />
        </Card>
      )}
      <ProReviewCard a={a} />
    </>
  );
}

export function AssessmentView(props: Props) {
  const { user } = useAuth();
  return user?.role === 'caregiver' ? <MotherResult {...props} /> : <StaffResult {...props} />;
}
