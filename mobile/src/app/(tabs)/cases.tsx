import { router } from 'expo-router';
import React, { useState } from 'react';
import { Card, Empty, ErrorBox, H2, Loading, MoreLink, P, RiskBadge, Row, Screen, Segmented, StatusPill } from '../../components/ui';
import { SyncBanner } from '../../components/SyncBanner';
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
  const [allReviews, setAllReviews] = useState(false);
  const cases = useApi<CaseItem[]>(`/api/cases${filter === 'active' ? '?status_filter=open,in_progress,referred' : ''}`);
  const reviews = useApi<Assessment[]>(staff ? '/api/reviews/pending' : null);

  // Emergencies first, then by priority and newest; AI reviews are paperwork, so they come after the cases.
  const RANK: Record<CaseItem['priority'], number> = { emergency: 0, high: 1, medium: 2, low: 3 };
  const sortedCases = [...(cases.data ?? [])].sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.created_at.localeCompare(a.created_at));
  const RISK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedReviews = [...(reviews.data ?? [])].sort((a, b) => (RISK[a.risk_level] ?? 3) - (RISK[b.risk_level] ?? 3));

  return (
    <Screen refreshing={cases.loading} onRefresh={() => [cases.reload(), reviews.reload()]}>
      <SyncBanner stale={cases.stale} />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: t('filterActive') },
          { value: 'all', label: t('filterAll') },
        ]}
      />
      {cases.error && <ErrorBox message={cases.error} onRetry={cases.reload} />}
      {!cases.data && !cases.error && <Loading />}
      {cases.data?.length === 0 && <Empty text={t('noCases')} />}
      {sortedCases.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/case/${c.id}`)} style={c.priority === 'emergency' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, flex: 1 }}>{c.child_name}</Text>
            <StatusPill status={PRIORITY_STATUS[c.priority]} label={t(`prio_${c.priority}`)} />
          </Row>
          <P muted>
            {c.region?.name} · {t(`cstatus_${c.status}`)} · {formatDate(c.created_at, lang)}
          </P>
          {c.assessment?.reasons[0] && <P style={{ fontSize: 14 }}>{c.assessment.reasons[0].text}</P>}
        </Card>
      ))}

      {staff && sortedReviews.length > 0 && (
        <Card style={{ borderColor: colors.accent, marginTop: 8 }}>
          <H2 emoji="🔎">
            {t('pendingReviews')} ({sortedReviews.length})
          </H2>
          <P muted style={{ fontSize: 14, marginTop: -6 }}>
            {t('pendingReviewsSub')}
          </P>
          {sortedReviews.slice(0, allReviews ? 20 : 3).map((a) => (
            <Card key={a.id} onPress={() => router.push(`/child/${a.child_id}`)} style={{ padding: 12, marginBottom: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{a.child_name}</Text>
                <RiskBadge level={a.risk_level} />
              </Row>
              {a.reasons[0] && <P style={{ fontSize: 14 }}>{a.reasons[0].text}</P>}
              <P muted style={{ fontSize: 13 }}>{formatDate(a.created_at, lang)}</P>
            </Card>
          ))}
          {sortedReviews.length > 3 && <MoreLink label={allReviews ? t('showLess') : `${t('seeAll')} (${sortedReviews.length})`} open={allReviews} onPress={() => setAllReviews(!allReviews)} />}
        </Card>
      )}
    </Screen>
  );
}
