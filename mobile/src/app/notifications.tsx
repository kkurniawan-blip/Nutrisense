import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { Button, Card, Empty, ErrorBox, Loading, P, Row, Screen } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Notification } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors } from '../theme';

export default function Notifications() {
  const { t, user } = useAuth();
  const list = useApi<Notification[]>('/api/notifications');

  const open = async (n: Notification) => {
    if (!n.read) await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    const d = n.data as Record<string, number | undefined>;
    if (d.case_id && user?.role !== 'caregiver') router.push(`/case/${d.case_id}`);
    else if (d.child_id) router.push(`/child/${d.child_id}`);
    else if (d.supply_request_id) router.push(user?.role === 'caregiver' ? '/pickups' : `/supply/${d.supply_request_id}`);
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
      {!list.data && <Loading />}
      {list.data?.length === 0 && <Empty text={t('noNotifications')} />}
      {list.data?.map((n) => (
        <Card key={n.id} onPress={() => open(n)} style={!n.read ? { borderColor: colors.primary } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: n.read ? '500' : '800', color: colors.text, flex: 1 }}>{n.title}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(n.created_at).toLocaleString()}</Text>
          </Row>
          <P muted>{n.body}</P>
        </Card>
      ))}
    </Screen>
  );
}
