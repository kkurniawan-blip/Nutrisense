import React from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Card, Empty, ErrorBox, Loading, P, Row, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import type { SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

export default function Pickups() {
  const { t } = useAuth();
  const reqs = useApi<SupplyRequest[]>('/api/supply-requests');

  const ready = (reqs.data ?? []).filter((r) => r.status === 'ready_for_pickup');
  const others = (reqs.data ?? []).filter((r) => r.status !== 'ready_for_pickup');

  return (
    <Screen refreshing={reqs.loading} onRefresh={reqs.reload}>
      {reqs.error && <ErrorBox message={reqs.error} onRetry={reqs.reload} />}
      {!reqs.data && <Loading />}
      {reqs.data?.length === 0 && <Empty text={t('noPickups')} />}
      {ready.map((r) => (
        <Card key={r.id} style={{ borderColor: colors.primary, borderWidth: 2 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800', fontSize: 17, color: colors.text, flex: 1 }}>{r.child_name}</Text>
            <Badge text={t('status_ready_for_pickup')} fg="#fff" bg={colors.primary} />
          </Row>
          <P>{r.locker?.name}</P>
          {r.items.map((i) => (
            <P key={i.item_key} muted>
              • {i.quantity}× {i.name}
            </P>
          ))}
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            {r.qr_payload && <QRCode value={r.qr_payload} size={200} />}
            <P muted style={{ marginTop: 8 }}>{t('showQR')}</P>
            <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 6, color: colors.primaryDark }}>{r.pickup_code}</Text>
            <P muted>{t('pickupCode')}</P>
          </View>
          {r.expires_at && (
            <P muted style={{ fontSize: 12 }}>
              {t('expires')}: {new Date(r.expires_at).toLocaleString()}
            </P>
          )}
        </Card>
      ))}
      {others.map((r) => {
        const chosen = r.decision?.chosen;
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{r.child_name}</Text>
              <Badge text={t(`status_${r.status}`)} fg={colors.info} bg={colors.infoSoft} />
            </Row>
            <P muted style={{ fontSize: 13 }}>{r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</P>
            {r.status === 'in_transit' && chosen && (
              <P style={{ fontSize: 13 }}>
                {t(`via_${chosen.type}`)} → {chosen.locker_name} · {t('eta')} ~{Math.round(chosen.eta_minutes)} {t('minutes')}
              </P>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
