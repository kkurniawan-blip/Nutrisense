import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { Badge, Card, Empty, ErrorBox, H2, Loading, P, RiskBadge, Row, Screen, Segmented } from '../../components/ui';
import { isOversight, useAuth } from '../../lib/auth';
import type { Assessment, CaseItem } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

const PRIORITY_COLOR = { emergency: colors.danger, high: colors.danger, medium: colors.warn, low: colors.muted } as const;

export default function Cases() {
  const { t, user } = useAuth();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const cases = useApi<CaseItem[]>(`/api/cases${filter === 'active' ? '?status_filter=open,in_progress,referred' : ''}`);
  const reviews = useApi<Assessment[]>(isOversight(user) ? '/api/reviews/pending' : null);

  return (
    <Screen refreshing={cases.loading} onRefresh={() => [cases.reload(), reviews.reload()]}>
      {isOversight(user) && (reviews.data?.length ?? 0) > 0 && (
        <Card style={{ borderColor: colors.accent }}>
          <H2>
            {t('pendingReviews')} ({reviews.data!.length})
          </H2>
          {reviews.data!.slice(0, 5).map((a) => (
            <Card key={a.id} onPress={() => router.push(`/child/${a.child_id}`)} style={{ padding: 10, marginBottom: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{a.child_name}</Text>
                <RiskBadge level={a.risk_level} />
              </Row>
              <P muted style={{ fontSize: 12 }}>
                {t('confidence')} {Math.round(a.confidence * 100)}% {a.guardrail ? `· ${a.guardrail}` : ''}
              </P>
            </Card>
          ))}
        </Card>
      )}
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Active / Aktif' },
          { value: 'all', label: 'All / Semua' },
        ]}
      />
      {cases.error && <ErrorBox message={cases.error} onRetry={cases.reload} />}
      {!cases.data && <Loading />}
      {cases.data?.length === 0 && <Empty text="–" />}
      {cases.data?.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/case/${c.id}`)} style={c.priority === 'emergency' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, flex: 1 }}>{c.child_name}</Text>
            <Badge text={c.priority.toUpperCase()} fg="#fff" bg={PRIORITY_COLOR[c.priority]} />
          </Row>
          <P muted>
            #{c.id} · {c.region?.name} · {c.status} · {new Date(c.created_at).toLocaleDateString()}
          </P>
          {c.assessment?.reasons[0] && <P style={{ fontSize: 14 }}>{c.assessment.reasons[0].text}</P>}
        </Card>
      ))}
    </Screen>
  );
}
