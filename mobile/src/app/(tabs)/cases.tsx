import { router } from 'expo-router';
import React, { useState } from 'react';
import { Card, Empty, ErrorBox, H2, Loading, P, RiskBadge, Row, Screen, Segmented, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { PRIORITY_STATUS } from '../../lib/status';
import type { Assessment, CaseItem } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';
import { Text } from '../../components/Text';


export default function Cases() {
  const { t, lang, user } = useAuth();
  const staff = !!user && user.role !== 'caregiver';
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const cases = useApi<CaseItem[]>(`/api/cases${filter === 'active' ? '?status_filter=open,in_progress,referred' : ''}`);
  const reviews = useApi<Assessment[]>(staff ? '/api/reviews/pending' : null);

  return (
    <Screen refreshing={cases.loading} onRefresh={() => [cases.reload(), reviews.reload()]}>
      {staff && (reviews.data?.length ?? 0) > 0 && (
        <Card style={{ borderColor: colors.accent }}>
          <H2 emoji="🔎">
            {t('pendingReviews')} ({reviews.data!.length})
          </H2>
          <P muted style={{ fontSize: 13, marginTop: -6 }}>
            {t('pendingReviewsSub')}
          </P>
          {reviews.data!.slice(0, 5).map((a) => (
            <Card key={a.id} onPress={() => router.push(`/child/${a.child_id}`)} style={{ padding: 10, marginBottom: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{a.child_name}</Text>
                <RiskBadge level={a.risk_level} />
              </Row>
              {a.reasons[0] && <P style={{ fontSize: 13 }}>{a.reasons[0].text}</P>}
              <P muted style={{ fontSize: 12 }}>
                {formatDate(a.created_at, lang)} · {t('confidence')} {Math.round(a.confidence * 100)}%
              </P>
            </Card>
          ))}
        </Card>
      )}
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: t('filterActive') },
          { value: 'all', label: t('filterAll') },
        ]}
      />
      {cases.error && <ErrorBox message={cases.error} onRetry={cases.reload} />}
      {!cases.data && <Loading />}
      {cases.data?.length === 0 && <Empty text={t('noCases')} />}
      {cases.data?.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/case/${c.id}`)} style={c.priority === 'emergency' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, flex: 1 }}>{c.child_name}</Text>
            <StatusPill status={PRIORITY_STATUS[c.priority]} label={t(`prio_${c.priority}`)} />
          </Row>
          <P muted>
            #{c.id} · {c.region?.name} · {t(`cstatus_${c.status}`)} · {formatDate(c.created_at, lang)}
          </P>
          {c.assessment?.reasons[0] && <P style={{ fontSize: 14 }}>{c.assessment.reasons[0].text}</P>}
        </Card>
      ))}
    </Screen>
  );
}
