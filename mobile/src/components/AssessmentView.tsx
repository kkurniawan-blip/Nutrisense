import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { FEATURE_LABELS, label } from '../lib/i18n';
import type { Assessment } from '../lib/types';
import { colors } from '../theme';
import { Bar, Card, H2, P, RiskBadge, Row } from './ui';

export function fmtZ(z: number | null | undefined) {
  return z === null || z === undefined ? '–' : `${z > 0 ? '+' : ''}${z.toFixed(1)}`;
}

export function AssessmentView({ a, compact }: { a: Assessment; compact?: boolean }) {
  const { t, lang } = useAuth();
  const emergency = a.triage.urgency === 'emergency';
  const maxContribution = Math.max(...a.explanation.map((e) => Math.abs(e.contribution)), 0.01);
  return (
    <>
      {emergency && (
        <Card style={{ backgroundColor: colors.danger, borderColor: colors.danger }}>
          <Row>
            <Ionicons name="warning" size={26} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17, flex: 1 }}>{t('dangerTitle')}</Text>
          </Row>
          <Text style={{ color: '#fff', marginTop: 6, fontSize: 15 }}>{a.triage.actions[0]?.text}</Text>
        </Card>
      )}
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <RiskBadge level={a.risk_level} large />
          <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</Text>
        </Row>
        <Text style={{ fontWeight: '700', color: emergency ? colors.danger : colors.text, fontSize: 16 }}>{t(`urgency_${a.triage.urgency}`)}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
          {t('confidence')}: {Math.round(a.confidence * 100)}%
          {a.reviewed_at ? ` · ${t('reviewedBy')}` : a.needs_review ? ` · ${t('needsReview')}` : ''}
        </Text>
        {a.review_note ? <P muted>“{a.review_note}”</P> : null}
      </Card>

      <Card>
        <H2>{t('whyRisk')}</H2>
        {a.reasons.map((r) => (
          <Row key={r.code + r.text} style={{ alignItems: 'flex-start', marginBottom: 6 }}>
            <Ionicons name="ellipse" size={8} color={colors.primary} style={{ marginTop: 7 }} />
            <P style={{ flex: 1 }}>{r.text}</P>
          </Row>
        ))}
      </Card>

      <Card>
        <H2>{t('whatToDo')}</H2>
        {a.triage.actions.map((x, i) => (
          <Row key={x.code} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={{ backgroundColor: colors.primary, borderRadius: 12, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{i + 1}</Text>
            </View>
            <P style={{ flex: 1 }}>{x.text}</P>
          </Row>
        ))}
        {a.triage.supplies.length > 0 && (
          <>
            <Text style={{ fontWeight: '700', marginTop: 6, color: colors.text }}>{t('supplies')}</Text>
            {a.triage.supplies.map((s) => (
              <P key={s.item_key} muted>
                • {s.quantity}× {s.name}
              </P>
            ))}
          </>
        )}
        <P muted style={{ fontSize: 12, marginTop: 8 }}>{a.triage.disclaimer}</P>
      </Card>

      {!compact && a.explanation.length > 0 && (
        <Card>
          <H2>{t('aiFactors')}</H2>
          {a.explanation.map((e) => (
            <View key={e.feature} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>{label(FEATURE_LABELS, e.feature, lang)}</Text>
                <Text style={{ color: e.contribution > 0 ? colors.danger : colors.ok, fontWeight: '700' }}>
                  {e.contribution > 0 ? '▲' : '▼'} {Math.abs(e.contribution * 100).toFixed(0)}
                </Text>
              </Row>
              <Bar pct={(Math.abs(e.contribution) / maxContribution) * 100} color={e.contribution > 0 ? colors.danger : colors.ok} />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}
