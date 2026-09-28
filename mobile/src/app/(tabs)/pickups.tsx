import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Text } from '../../components/Text';
import { Bubble, Card, ErrorBox, H2, ListRow, Loading, Row, Screen, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatDuration } from '../../lib/fun';
import { motherStatus, txt } from '../../lib/status';
import type { Child, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, statusColor } from '../../theme';

const STEPS = [
  { key: 'pending_approval', emoji: '📝' },
  { key: 'in_transit', emoji: '🚁' },
  { key: 'ready_for_pickup', emoji: '📦' },
  { key: 'picked_up', emoji: '✅' },
];

function Progress({ status, via }: { status: string; via: string | null }) {
  const { t } = useAuth();
  const idx = Math.max(0, STEPS.findIndex((s) => s.key === status));
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
      {STEPS.map((s, i) => {
        const done = i <= idx;
        const emoji = s.key === 'in_transit' && via === 'courier' ? '🛵' : s.key === 'in_transit' && via === 'locker_stock' ? '🏪' : s.emoji;
        return (
          <View key={s.key} style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: done ? colors.mintSoft : '#E9ECF2', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: done ? colors.mint : '#C9CFDA' }}>
              <Text style={{ fontSize: 18, opacity: done ? 1 : 0.4 }}>{emoji}</Text>
            </View>
            <Text style={{ fontSize: 12, textAlign: 'center', color: done ? colors.ok : colors.muted, fontWeight: '700', marginTop: 2 }}>{t(`status_${s.key}`)}</Text>
          </View>
        );
      })}
    </Row>
  );
}

export default function Pickups() {
  const { t, lang } = useAuth();
  const reqs = useApi<SupplyRequest[]>('/api/supply-requests');
  const children = useApi<Child[]>('/api/children');
  const kids = children.data ?? [];

  const ready = (reqs.data ?? []).filter((r) => r.status === 'ready_for_pickup');
  const others = (reqs.data ?? []).filter((r) => r.status !== 'ready_for_pickup');

  return (
    <Screen
      refreshing={reqs.loading}
      onRefresh={() => {
        reqs.reload();
        children.reload();
      }}
    >
      <Bubble mood="cheer" tint={colors.accentSoft}>
        {t('packageHero')}
      </Bubble>

      {/* 1. Health information: where each child stands (no products here). */}
      {kids.length > 0 && (
        <Card>
          <H2 emoji="ℹ️">{t('pkgHealthInfo')}</H2>
          {kids.map((c) => {
            const st = motherStatus(c.latest_assessment);
            return (
              <Row key={c.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontWeight: '800', flex: 1 }}>{c.name.split(' ')[0]}</Text>
                <StatusPill status={st.key} label={txt(st.label, lang)} />
              </Row>
            );
          })}
        </Card>
      )}

      {/* 2. Recommended actions: things to do at home, free, from the latest assessment. */}
      {kids.length > 0 && (
        <Card>
          <H2 emoji="✅">{t('pkgActions')}</H2>
          {kids.map((c) => {
            const acts = c.latest_assessment?.triage.actions.slice(0, 2) ?? [];
            return (
              <View key={c.id} style={{ marginBottom: 6 }}>
                {kids.length > 1 && <Text style={{ fontWeight: '800', color: colors.muted, marginBottom: 2 }}>{c.name.split(' ')[0]}</Text>}
                {acts.map((a) => (
                  <Text key={a.code} style={{ lineHeight: 22, marginBottom: 4 }}>
                    • {a.text}
                  </Text>
                ))}
                <ListRow emoji="🍳" title={t('seeMenuIdeas')} subtitle={t('easyCheap')} onPress={() => router.push(`/child/${c.id}/recipes`)} />
              </View>
            );
          })}
        </Card>
      )}

      {/* 3. Available products: optional support, never a requirement. */}
      <H2 emoji="🎁">{t('pkgAvailable')}</H2>
      <Card tint={statusColor.info.bg}>
        <Text style={{ color: statusColor.info.fg, fontWeight: '700', lineHeight: 21 }}>ℹ️ {t('pkgNotRequired')}</Text>
      </Card>
      {reqs.error && <ErrorBox message={reqs.error} onRetry={reqs.reload} />}
      {!reqs.data && <Loading />}
      {reqs.data?.length === 0 && <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 12 }}>📭 {t('noPickups')}</Text>}

      {ready.map((r) => (
        <Card key={r.id} style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ backgroundColor: colors.primary, padding: 16 }}>
            <Text style={{ color: '#fff', fontSize: 30 }}>🎁</Text>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 19 }}>{r.child_name}</Text>
            <Text style={{ color: '#ffffffdd', fontWeight: '700' }}>📍 {r.locker?.name}</Text>
          </View>
          <View style={{ padding: 16 }}>
            {r.items.map((i) => (
              <Text key={i.item_key} style={{ fontWeight: '600' }}>
                • {i.quantity}× {i.name}
              </Text>
            ))}
          </View>
          {/* ticket perforation */}
          <Row style={{ marginHorizontal: -10 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg }} />
            <View style={{ flex: 1, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.border }} />
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg }} />
          </Row>
          <View style={{ alignItems: 'center', padding: 16 }}>
            {r.qr_payload && <QRCode value={r.qr_payload} size={190} color={colors.text} />}
            <Text style={{ color: colors.muted, marginTop: 8 }}>{t('showQR')}</Text>
            <Text style={{ fontSize: 34, fontWeight: '900', letterSpacing: 8, color: colors.primaryDark }}>{r.pickup_code}</Text>
            <Text style={{ color: colors.muted }}>{t('pickupCode')}</Text>
            {r.expires_at && (
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
                ⏰ {t('expires')}: {formatDate(r.expires_at, lang, true)}
              </Text>
            )}
          </View>
        </Card>
      ))}

      {others.map((r) => {
        const chosen = r.decision?.chosen;
        return (
          <Card key={r.id}>
            <Text style={{ fontWeight: '900', fontSize: 16 }}>🎁 {r.child_name}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</Text>
            {['pending_approval', 'in_transit', 'picked_up'].includes(r.status) ? (
              <Progress status={r.status} via={r.fulfillment} />
            ) : (
              <Text style={{ marginTop: 6, fontWeight: '700', color: colors.warn }}>{t(`status_${r.status}`)}</Text>
            )}
            {r.status === 'in_transit' && chosen && (
              <Text style={{ fontSize: 13, marginTop: 8, fontWeight: '700', color: colors.info }}>
                {t(`via_${chosen.type}`)} → {chosen.locker_name} · {t('eta')} ~{formatDuration(chosen.eta_minutes, lang)}
              </Text>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
