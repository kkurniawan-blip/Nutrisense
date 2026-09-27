import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Badge, Bar, Button, Card, ErrorBox, H2, P, Row, Screen, Segmented } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { isOversight, useAuth } from '../../lib/auth';
import { formatDate, formatDuration } from '../../lib/fun';
import type { Locker, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';
import { Text } from '../../components/Text';

interface Drone {
  id: number;
  code: string;
  hub_name: string;
  status: string;
  battery_pct: number;
  max_range_km: number;
}

interface Dispatch {
  id: number;
  supply_request_id: number;
  drone_code: string;
  distance_km: number;
  eta_minutes: number;
  status: string;
  launched_at: string | null;
}

type Tab = 'requests' | 'lockers' | 'drones';

export default function Logistics() {
  const { t, lang, user } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const requests = useApi<SupplyRequest[]>('/api/supply-requests');
  const lockers = useApi<Locker[]>(tab === 'lockers' ? '/api/lockers' : null);
  const drones = useApi<Drone[]>(tab === 'drones' ? '/api/drones' : null);
  const dispatches = useApi<Dispatch[]>(tab === 'drones' ? '/api/dispatches' : null);
  const [msg, setMsg] = useState<string | null>(null);

  const simulate = async () => {
    try {
      const r = await api<Record<string, number>>('/api/logistics/simulate?minutes=30', { method: 'POST' });
      setMsg(Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' · '));
      [requests, drones, dispatches, lockers].forEach((x) => void x.reload());
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
    <Screen refreshing={requests.loading} onRefresh={() => [requests, lockers, drones, dispatches].forEach((x) => void x.reload())}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'requests', label: t('supplyRequests') },
          { value: 'lockers', label: t('lockers') },
          { value: 'drones', label: t('drones') },
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

      {tab === 'drones' && (
        <>
          <H2>{t('drones')}</H2>
          {(drones.data ?? []).map((d) => (
            <Card key={d.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>
                  {d.code} · {d.hub_name}
                </Text>
                <Badge text={t(`drone_${d.status}`)} fg={d.status === 'in_flight' ? colors.info : colors.muted} bg={d.status === 'in_flight' ? colors.infoSoft : '#EEF1F0'} />
              </Row>
              <Row style={{ marginTop: 6 }}>
                <Text style={{ color: colors.muted, width: 90, fontSize: 12 }}>🔋 {Math.round(d.battery_pct)}%</Text>
                <Bar pct={d.battery_pct} />
              </Row>
              <P muted style={{ fontSize: 12 }}>{t('droneRange')} {d.max_range_km} km</P>
            </Card>
          ))}
          <H2>{t('dispatches')}</H2>
          {(dispatches.data ?? []).map((d) => (
            <Card key={d.id} onPress={() => router.push(`/supply/${d.supply_request_id}`)}>
              <Text style={{ color: colors.text }}>
                {d.drone_code} · {d.distance_km} km · {t('eta')} {formatDuration(d.eta_minutes, lang)} · {t(`dispatch_${d.status}`)}
              </Text>
              {d.launched_at && <P muted style={{ fontSize: 12 }}>{formatDate(d.launched_at, lang, true)}</P>}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
