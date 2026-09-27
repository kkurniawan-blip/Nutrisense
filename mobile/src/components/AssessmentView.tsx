import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { FRIENDLY_RISK } from '../lib/fun';
import { FEATURE_LABELS, label } from '../lib/i18n';
import type { Assessment } from '../lib/types';
import { colors, riskColor } from '../theme';
import { Mascot } from './Mascot';
import { Text } from './Text';
import { Bar, Card, H2, P, RiskBadge, Row } from './ui';

export function fmtZ(z: number | null | undefined) {
  return z === null || z === undefined ? '–' : `${z > 0 ? '+' : ''}${z.toFixed(1)}`;
}

const DOT_COLORS = [colors.primary, colors.mint, colors.lavender, colors.sky, colors.accent, colors.pink];

export function AssessmentView({ a, compact }: { a: Assessment; compact?: boolean }) {
  const { t, lang, user } = useAuth();
  const mom = user?.role === 'caregiver';
  const [showAI, setShowAI] = useState(!mom);
  const emergency = a.triage.urgency === 'emergency';
  const maxContribution = Math.max(...a.explanation.map((e) => Math.abs(e.contribution)), 0.01);
  const rc = riskColor[a.risk_level];

  return (
    <>
      {emergency && (
        <Card tint={colors.danger}>
          <Row>
            <Ionicons name="warning" size={30} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, flex: 1 }}>{t('dangerTitle')}</Text>
          </Row>
          <Text style={{ color: '#fff', marginTop: 8, fontSize: 16, fontWeight: '700' }}>{a.triage.actions[0]?.text}</Text>
        </Card>
      )}

      <Card tint={rc.bg}>
        <Row style={{ gap: 12 }}>
          <Mascot size={72} mood={a.risk_level === 'low' ? 'cheer' : a.risk_level === 'medium' ? 'thinking' : 'caring'} />
          <View style={{ flex: 1 }}>
            {mom ? (
              <Text style={{ fontSize: 20, fontWeight: '900', color: rc.fg }}>
                {FRIENDLY_RISK[a.risk_level].emoji} {FRIENDLY_RISK[a.risk_level][lang]}
              </Text>
            ) : (
              <RiskBadge level={a.risk_level} large clinical />
            )}
            <Text style={{ fontWeight: '800', marginTop: 4, color: emergency ? colors.danger : colors.text }}>{t(`urgency_${a.triage.urgency}`)}</Text>
            {mom && <Text style={{ color: colors.text, marginTop: 4 }}>{a.risk_level === 'low' ? t('celebrate') : t('supportive')}</Text>}
          </View>
        </Row>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          {new Date(a.created_at).toLocaleString()} · {t('confidence')} {Math.round(a.confidence * 100)}%
          {a.reviewed_at ? ` · ✅ ${t('reviewedBy')}` : a.needs_review ? ` · ⏳ ${t('needsReview')}` : ''}
        </Text>
        {a.review_note ? <P muted>“{a.review_note}”</P> : null}
      </Card>

      <Card>
        <H2 emoji="🔍">{t('whyRisk')}</H2>
        {a.reasons.map((r, i) => (
          <Row key={r.code + r.text} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DOT_COLORS[i % DOT_COLORS.length], marginTop: 6 }} />
            <P style={{ flex: 1 }}>{r.text}</P>
          </Row>
        ))}
      </Card>

      <Card>
        <H2 emoji="🗺️">{t('whatToDo')}</H2>
        {a.triage.actions.map((x, i) => (
          <Row key={x.code} style={{ alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length], borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>{i + 1}</Text>
            </View>
            <P style={{ flex: 1 }}>{x.text}</P>
          </Row>
        ))}
        {a.triage.supplies.length > 0 && (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12, marginTop: 4 }}>
            <Text style={{ fontWeight: '900', marginBottom: 4 }}>🎁 {t('supplies')}</Text>
            {a.triage.supplies.map((s) => (
              <P key={s.item_key}>
                • {s.quantity}× {s.name}
              </P>
            ))}
          </View>
        )}
        <P muted style={{ fontSize: 12, marginTop: 8 }}>{a.triage.disclaimer}</P>
      </Card>

      {!compact && a.explanation.length > 0 && (
        <Card>
          <Pressable onPress={() => setShowAI(!showAI)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '900', fontSize: 16 }}>🤖 {mom ? t('seeAIDetails') : t('aiFactors')}</Text>
              <Ionicons name={showAI ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
            </Row>
          </Pressable>
          {showAI &&
            a.explanation.map((e) => (
              <View key={e.feature} style={{ marginTop: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text>{label(FEATURE_LABELS, e.feature, lang)}</Text>
                  <Text style={{ color: e.contribution > 0 ? colors.danger : colors.ok, fontWeight: '800' }}>
                    {e.contribution > 0 ? '▲' : '▼'} {Math.abs(e.contribution * 100).toFixed(0)}
                  </Text>
                </Row>
                <Bar pct={(Math.abs(e.contribution) / maxContribution) * 100} color={e.contribution > 0 ? colors.primary : colors.mint} warnBelow={0} />
              </View>
            ))}
        </Card>
      )}
    </>
  );
}
