import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, ErrorBox, P, Row, Screen, Segmented } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { isOversight, useAuth } from '../../lib/auth';
import type { Locker, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';
import { Text } from '../../components/Text';

type Tab = 'requests' | 'lockers';

export default function Logistics() {
  const { t, user } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const requests = useApi<SupplyRequest[]>('/api/supply-requests');
  const lockers = useApi<Locker[]>(tab === 'lockers' ? '/api/lockers' : null);
  const [msg, setMsg] = useState<string | null>(null);

  const simulate = async () => {
    try {
      const r = await api<Record<string, number>>('/api/logistics/simulate?minutes=30', { method: 'POST' });
      setMsg(Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' · '));
      [requests, lockers].forEach((x) => void x.reload());
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const restock = async (lockerId: number, item: string) => {
    try {
      await api(`/api/lockers/${lockerId}/restock`, { body: { item_key: item, quantity: 10 } });
      void lockers.reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const order: Record<string, number> = { pending_approval: 0, awaiting_stock: 1, in_transit: 2, ready_for_pickup: 3 };
  const sorted = [...(requests.data ?? [])].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return (
    <Screen refreshing={requests.loading} onRefresh={() => [requests, lockers].forEach((x) => void x.reload())}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'requests', label: t('supplyRequests') },
          { value: 'lockers', label: t('lockers') },
        ]}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        {user?.role === 'kader' && <Button small variant="secondary" title={t('scanPickup')} icon="qr-code-outline" onPress={() => router.push('/scan')} />}
        {isOversight(user) && <Button small variant="ghost" title={`${t('simulate')} +30 ${t('minutes')}`} icon="play-forward-outline" onPress={simulate} />}
      </Row>
      {msg && <P muted>{msg}</P>}
      {requests.error && <ErrorBox message={requests.error} onRetry={requests.reload} />}

      {tab === 'requests' &&
        sorted.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/supply/${r.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>
                #{r.id} {r.child_name}
              </Text>
              <Badge
                text={t(`status_${r.status}`)}
                fg={r.status === 'pending_approval' ? colors.warn : colors.info}
                bg={r.status === 'pending_approval' ? colors.warnSoft : colors.infoSoft}
              />
            </Row>
            <P muted style={{ fontSize: 13 }}>{r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</P>
            {r.fulfillment && (
              <P muted style={{ fontSize: 12 }}>
                {t(`via_${r.fulfillment}`)} → {r.locker?.name}
              </P>
            )}
          </Card>
        ))}

      {tab === 'lockers' &&
        (lockers.data ?? []).map((lk) => (
          <Card key={lk.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{lk.name}</Text>
              <Badge text={lk.kind === 'hub' ? 'HUB' : lk.code} fg={colors.primaryDark} bg={colors.primarySoft} />
            </Row>
            {lk.inventory.map((i) => (
              <View key={i.item_key} style={{ marginTop: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: i.low ? colors.danger : colors.text, flex: 1, fontSize: 13 }}>{i.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {i.available}/{i.quantity}
                    {i.reserved ? ` (${i.reserved} ${t('reserved')})` : ''}
                  </Text>
                  {i.low && isOversight(user) && <Button small variant="ghost" title={`${t('restock')} +10`} onPress={() => restock(lk.id, i.item_key)} />}
                </Row>
              </View>
            ))}
          </Card>
        ))}

    </Screen>
  );
}
