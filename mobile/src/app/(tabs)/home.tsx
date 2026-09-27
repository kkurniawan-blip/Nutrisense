import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ChildCard } from '../../components/ChildCard';
import { Button, Card, Empty, ErrorBox, H1, H2, Loading, P, RiskBadge, Row, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { flush, queued } from '../../lib/offline';
import type { Child } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

interface PriorityRow {
  child_id: number;
  name: string;
  age_months: number;
  region: string;
  risk_level: 'low' | 'medium' | 'high';
  urgency: string;
  needs_review: boolean;
  top_reason: string | null;
}

export default function Home() {
  const { user, t } = useAuth();
  const kader = user?.role === 'kader';
  const children = useApi<Child[]>('/api/children');
  const priority = useApi<PriorityRow[]>(kader ? '/api/dashboard/priority?limit=10' : null);
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async (silent = false) => {
    const q = await queued();
    setPending(q.length);
    if (!q.length) return;
    setSyncing(true);
    try {
      const r = await flush();
      setPending(r.remaining);
      if (!silent || r.sent) setSyncMsg(`${t('synced')}: ${r.sent}${r.failed ? ` · ${t('error')}: ${r.failed}` : ''}`);
      if (r.sent) {
        void children.reload();
        void priority.reload();
      }
    } catch (e) {
      setSyncMsg(String(e));
    } finally {
      setSyncing(false);
    }
  }, [children, priority, t]);

  useFocusEffect(
    useCallback(() => {
      void sync(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const refresh = () => {
    void children.reload();
    void priority.reload();
    void sync(true);
  };

  return (
    <Screen refreshing={children.loading} onRefresh={refresh}>
      <H1>
        {t('home')}, {user?.full_name.split(' ').slice(0, 2).join(' ')}
      </H1>
      {pending > 0 && (
        <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.accent }}>
          <P>
            {pending} {t('pendingSync')}
          </P>
          <Button small title={t('syncNow')} onPress={() => sync()} loading={syncing} icon="cloud-upload-outline" />
        </Card>
      )}
      {syncMsg && <P muted>{syncMsg}</P>}

      {kader && (
        <>
          <H2 right={<Button small variant="secondary" title={t('scanPickup')} icon="qr-code-outline" onPress={() => router.push('/scan')} />}>
            {t('priorityList')}
          </H2>
          {priority.error && <ErrorBox message={priority.error} onRetry={priority.reload} />}
          {(priority.data ?? [])
            .filter((p) => p.urgency !== 'routine')
            .slice(0, 6)
            .map((p) => (
              <Card key={p.child_id} onPress={() => router.push(`/child/${p.child_id}`)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, flex: 1 }}>{p.name}</Text>
                  <RiskBadge level={p.risk_level} />
                </Row>
                <Text style={{ color: p.urgency === 'emergency' ? colors.danger : colors.warn, fontWeight: '600', marginTop: 4 }}>
                  {t(`urgency_${p.urgency}`)} · {p.region}
                </Text>
                {p.top_reason && <P muted>{p.top_reason}</P>}
              </Card>
            ))}
        </>
      )}

      <H2 right={<Button small title={t('addChild')} icon="add" onPress={() => router.push('/child/new')} />}>
        {kader ? t('areaChildren') : t('myChildren')}
      </H2>
      {children.error && <ErrorBox message={children.error} onRetry={children.reload} />}
      {!children.data && children.loading && <Loading />}
      {children.data?.length === 0 && <Empty text={t('noChildren')} />}
      <View>{children.data?.map((c) => <ChildCard key={c.id} child={c} />)}</View>
      <P muted style={{ textAlign: 'center', fontSize: 12, marginTop: 8 }}>
        {t('disclaimer')}
      </P>
    </Screen>
  );
}
