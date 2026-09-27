import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { FEATURE_LABELS, label } from '../lib/i18n';
import { motherStatus, txt, zWords } from '../lib/status';
import type { Assessment } from '../lib/types';
import { colors, statusColor, StatusKey } from '../theme';
import { Mascot } from './Mascot';
import { Text } from './Text';
import { Bar, Card, H2, ListRow, P, RiskBadge, Row, SourceTag, StatusPill } from './ui';

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

function MotherResult({ a, compact, hideEmergency }: { a: Assessment; compact?: boolean; hideEmergency?: boolean }) {
  const { t, lang } = useAuth();
  const [details, setDetails] = useState(false);
  const st = motherStatus(a);
  const f = a.features as Record<string, number | null | string[]>;
  const codes = new Set(a.triage.actions.map((x) => x.code));
  const emergency = a.triage.urgency === 'emergency';
  const id = a.child_id;

  const actions: { emoji: string; title: string; subtitle?: string; go?: () => void }[] = [];
  if (emergency) {
    actions.push({ emoji: '🏥', title: t('actGoNow'), subtitle: a.triage.actions[0]?.text });
    if (codes.has('keep_breastfeeding')) actions.push({ emoji: '🤱', title: t('actKeepFeeding') });
  } else {
    actions.push({ emoji: '📏', title: t('actMeasureNext'), subtitle: codes.has('remeasure_2w') ? t('in2Weeks') : t('nextMonth'), go: () => router.push(`/child/${id}/measure`) });
    actions.push({ emoji: '🍽️', title: t('actWatchMeals'), subtitle: 'NutriScan', go: () => router.push(`/child/${id}/meal?action=manual`) });
    actions.push({ emoji: '🥗', title: t('actFollowPlan'), go: () => router.push(`/child/${id}/nutrition`) });
    if (codes.has('ors_zinc')) actions.push({ emoji: '💧', title: t('actOrs') });
    actions.push({
      emoji: '👩‍⚕️',
      title: t('actDiscuss'),
      subtitle: a.triage.urgency === 'doctor_48h' ? t('urgency_doctor_48h') : a.triage.urgency === 'kader_7d' ? t('kaderWillVisit') : undefined,
    });
  }

  const diarrhea = f.diarrhea ? t('fDiarrhea') : f.fever ? t('fFever') : f.respiratory ? t('fCough') : null;
  const imputed = (f.imputed as string[] | undefined) ?? [];
  const trend = TREND[a.trend?.status ?? 'no_data'] ?? TREND.no_data;
  const hz = zWords(f.haz as number | null, lang, 'height');
  const wz = zWords(f.waz as number | null, lang, 'weight');

  return (
    <>
      {/* One red warning per screen: skip it when the screen already shows its own (e.g. symptom checker with a call button). */}
      {emergency && !hideEmergency && (
        <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
          <Row>
            <Ionicons name="warning" size={28} color={colors.danger} />
            <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 18, flex: 1 }}>🚨 {t('seekHelpNow')}</Text>
          </Row>
          <Text style={{ marginTop: 6, fontWeight: '700' }}>{a.triage.actions[0]?.text}</Text>
        </Card>
      )}

      <Card>
        <SourceTag kind="ai" />
        <Row style={{ gap: 12 }}>
          <Mascot size={60} mood={st.key === 'ok' ? 'cheer' : st.key === 'urgent' ? 'caring' : 'thinking'} />
          <View style={{ flex: 1 }}>
            {/* In an emergency the red card already says what to do; the pill only names the state. */}
            <StatusPill status={st.key} label={txt(emergency ? st.label : st.headline, lang)} large />
            <Text style={{ marginTop: 6, fontWeight: emergency ? '800' : '400' }}>
              {st.key === 'ok' ? t('celebrate') : emergency ? t('urgentSupportive') : t('supportive')}
            </Text>
          </View>
        </Row>
      </Card>

      <Card>
        <H2 emoji="✅">{t('whatMomCanDo')}</H2>
        {actions.map((x, i) => (
          <ListRow key={x.title} emoji={x.emoji} title={`${i + 1}. ${x.title}`} subtitle={x.subtitle} onPress={x.go} right={x.go ? undefined : <View />} />
        ))}
      </Card>

      {!compact && (
        <Card>
          <H2 emoji="🔍">{t('whyAttention')}</H2>
          <FactorRow name={t('fHeightAge')} value={hz.text} status={hz.key} />
          <FactorRow name={t('fWeightAge')} value={wz.text} status={wz.key} />
          <FactorRow name={t('fTrend')} value={trend[lang]} status={trend.key} />
          <FactorRow name={t('fSymptoms')} value={diarrhea ?? t('fNoSymptoms')} status={diarrhea ? 'monitor' : 'ok'} />
          <FactorRow
            name={t('fDiet')}
            value={imputed.includes('dietary_diversity') ? t('fNoMeals') : `${Math.round(Number(f.dietary_diversity))}/8 ${t('groups')}`}
            status={imputed.includes('dietary_diversity') ? 'unknown' : (f.dietary_diversity as number) >= 5 ? 'ok' : 'monitor'}
          />
        </Card>
      )}

      <Card tint={statusColor.info.bg}>
        <Text style={{ color: statusColor.info.fg, fontWeight: '700' }}>ℹ️ {t('notDiagnosis')}</Text>
      </Card>

      {!compact && (
        <Card>
          <Pressable onPress={() => setDetails(!details)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '900', color: statusColor.ai.fg }}>🤖 {t('seeAIDetails')}</Text>
              <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
            </Row>
          </Pressable>
          {details && <TechnicalDetails a={a} />}
        </Card>
      )}
      <ProReviewCard a={a} />
    </>
  );
}

/** Z-scores, model confidence and feature contributions: only for those who want them. */
function TechnicalDetails({ a }: { a: Assessment }) {
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
function StaffResult({ a, compact, hideEmergency }: { a: Assessment; compact?: boolean; hideEmergency?: boolean }) {
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

export function AssessmentView({ a, compact, hideEmergency }: { a: Assessment; compact?: boolean; hideEmergency?: boolean }) {
  const { user } = useAuth();
  return user?.role === 'caregiver' ? (
    <MotherResult a={a} compact={compact} hideEmergency={hideEmergency} />
  ) : (
    <StaffResult a={a} compact={compact} hideEmergency={hideEmergency} />
  );
}
