import { router } from 'expo-router';
import React from 'react';
import { Button, Card, Empty, ErrorBox, IconChip, Loading, P, Row, Screen, StatusPill } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import type { Notification } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors } from '../theme';
import { Text } from '../components/Text';

const URGENT_KINDS = ['mother_danger', 'oedema', 'referral'];
const isUrgent = (n: Notification) => URGENT_KINDS.includes(n.kind) || n.data.urgency === 'emergency' || n.data.priority === 'emergency';

export default function Notifications() {
  const { t, lang, user } = useAuth();
  const list = useApi<Notification[]>('/api/notifications');
  // Urgent first, and the same message for the same child shown once (newest kept).
  const seen = new Set<string>();
  const items = [...(list.data ?? [])]
    .filter((n) => {
      const key = `${n.kind}:${String(n.data.child_id ?? n.data.case_id ?? n.id)}:${n.body}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a)) || Number(a.read) - Number(b.read));

  const open = async (n: Notification) => {
    if (!n.read) await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    const d = n.data as Record<string, number | undefined>;
    if (d.case_id && user?.role !== 'caregiver') router.push(`/case/${d.case_id}`);
    else if (d.child_id) router.push(`/child/${d.child_id}`);
    else if (d.supply_request_id) router.push(user?.role === 'caregiver' ? '/pickups' : `/supply/${d.supply_request_id}`);
    else if (d.pregnancy_id) router.push(n.kind === 'anc_result' && user?.role === 'caregiver' ? `/pregnancy/${d.pregnancy_id}/puskesmas` : `/pregnancy/${d.pregnancy_id}`);
    else void list.reload();
  };

  return (
    <Screen refreshing={list.loading} onRefresh={list.reload}>
      <Button
        small
        variant="ghost"
        title={t('markAllRead')}
        onPress={async () => {
          await api('/api/notifications/read-all', { method: 'POST' });
          void list.reload();
        }}
      />
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data?.length === 0 && <Empty text={t('noNotifications')} />}
      {items.map((n) => {
        const urgent = isUrgent(n);
        return (
          <Card key={n.id} onPress={() => open(n)} style={urgent ? { borderColor: colors.danger, borderWidth: 2 } : !n.read ? { borderColor: colors.primary } : undefined}>
            {urgent && <StatusPill status="urgent" label={t('urgentLbl')} />}
            <Row style={{ justifyContent: 'space-between', marginTop: urgent ? 6 : 0 }}>
              {n.kind === 'anc_result' && <IconChip emoji="🏥" tone="blue" size={44} />}
              <Text style={{ fontWeight: n.read ? '500' : '800', color: colors.text, flex: 1 }}>{n.title}</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{formatDate(n.created_at, lang, true)}</Text>
            </Row>
            <P muted>{n.body}</P>
          </Card>
        );
      })}
    </Screen>
  );
}
