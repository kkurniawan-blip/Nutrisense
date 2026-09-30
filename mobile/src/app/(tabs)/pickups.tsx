import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Text } from '../../components/Text';
import { Card, ErrorBox, IconChip, Loading, Row, Screen, Section, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { motherStatus, txt } from '../../lib/status';
import type { Child, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

const STEPS = [
  { key: 'pending_approval', emoji: '📝' },
  { key: 'in_transit', emoji: '🚚' },
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
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: done ? colors.mintSoft : colors.line, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: done ? colors.mint : '#D5D0EA' }}>
              <Text style={{ fontSize: 18, opacity: done ? 1 : 0.4 }}>{emoji}</Text>
            </View>
            <Text style={{ fontSize: 12, textAlign: 'center', color: done ? colors.ok : colors.muted, fontWeight: '700', marginTop: 2 }}>{t(`status_${s.key}`)}</Text>
          </View>
        );
      })}
    </Row>
  );
}

/** What each supply is for, in two or three words. */
const BENEFIT: Record<string, { id: string; en: string }> = {
  pmt_biscuit: { id: 'Energi & protein', en: 'Energy & protein' },
  rutf: { id: 'Pemulihan gizi', en: 'Nutrition recovery' },
  ors_zinc: { id: 'Untuk diare', en: 'For diarrhoea' },
  mnp_taburia: { id: 'Vitamin & mineral', en: 'Vitamins & minerals' },
  kelor_powder: { id: 'Zat besi & vitamin A', en: 'Iron & vitamin A' },
  vitamin_a: { id: 'Vitamin A', en: 'Vitamin A' },
  deworming: { id: 'Obat cacing', en: 'Deworming' },
};

/** One package: what is in it, what it is for, that it is free, where to collect it, and its state. */
function PackageCard({ r }: { r: SupplyRequest }) {
  const { t, lang } = useAuth();
  const ready = r.status === 'ready_for_pickup';
  const benefits = [...new Set(r.items.map((i) => BENEFIT[i.item_key]?.[lang]).filter(Boolean))];
  return (
    <Card style={ready ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
      <Row style={{ alignItems: 'flex-start', gap: 12 }}>
        <IconChip emoji="🎁" tone="orange" gradient size={46} />
        <View style={{ flex: 1, gap: 3 }}>
          {r.items.map((i) => (
            <Text key={i.item_key} style={{ fontWeight: '700' }}>
              {i.quantity}× {i.name}
            </Text>
          ))}
          {benefits.length > 0 && <Text style={{ color: colors.muted, fontSize: 13 }}>{benefits.join(' · ')}</Text>}
          <Row style={{ gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ok }}>{t('free')}</Text>
            {r.locker?.name ? <Text style={{ fontSize: 13, color: colors.muted }}>📍 {r.locker.name}</Text> : null}
          </Row>
        </View>
      </Row>
      {ready ? (
        <View style={{ alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: colors.line }}>
          {r.qr_payload && <QRCode value={r.qr_payload} size={170} color={colors.text} />}
          <Text style={{ fontSize: 30, fontWeight: '900', letterSpacing: 8, color: colors.primaryDark, marginTop: 10 }}>{r.pickup_code}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{t('showQR')}</Text>
          {r.expires_at && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
              ⏰ {t('expires')}: {formatDate(r.expires_at, lang, true)}
            </Text>
          )}
        </View>
      ) : ['pending_approval', 'in_transit', 'picked_up'].includes(r.status) ? (
        <Progress status={r.status} via={r.fulfillment} />
      ) : (
        <Text style={{ marginTop: 8, fontWeight: '700', color: colors.warn }}>{t(`status_${r.status}`)}</Text>
      )}
    </Card>
  );
}

export default function Pickups() {
  const { t, lang } = useAuth();
  const reqs = useApi<SupplyRequest[]>('/api/supply-requests');
  const children = useApi<Child[]>('/api/children');
  const kids = children.data ?? [];
  const all = reqs.data ?? [];
  // Ready packages first: they are the thing to act on.
  const order = (r: SupplyRequest) => (r.status === 'ready_for_pickup' ? 0 : r.status === 'picked_up' ? 2 : 1);

  return (
    <Screen
      refreshing={reqs.loading}
      onRefresh={() => {
        reqs.reload();
        children.reload();
      }}
    >
      <Text style={{ fontSize: 21, fontWeight: '900', marginBottom: 4 }}>{t('pkgCardTitle')}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>{t('pkgNotRequired')}</Text>
      {reqs.error && <ErrorBox message={reqs.error} onRetry={reqs.reload} />}
      {!reqs.data && <Loading />}

      {kids.map((c) => {
        const mine = all.filter((r) => r.child_id === c.id).sort((a, b) => order(a) - order(b));
        const st = motherStatus(c.latest_assessment);
        return (
          <View key={c.id}>
            <Section
              title={`${t('forChildShort')} ${c.name.split(' ')[0]}`}
              right={<StatusPill status={st.key} label={txt(st.label, lang)} />}
            />
            {mine.length === 0 ? <Text style={{ color: colors.muted, marginBottom: 14 }}>{t('noPickups')}</Text> : mine.map((r) => <PackageCard key={r.id} r={r} />)}
          </View>
        );
      })}
    </Screen>
  );
}
