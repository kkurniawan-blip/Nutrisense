import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, ErrorBox, H2, Loading, P, Row, Screen } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDuration } from '../../lib/fun';
import type { LogisticsOption, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';
import { Text } from '../../components/Text';

const ICON = { locker_stock: 'file-tray-stacked-outline', courier: 'bicycle-outline' } as const;

export default function SupplyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const list = useApi<SupplyRequest[]>('/api/supply-requests');
  const req = list.data?.find((r) => String(r.id) === id) ?? null;
  const pending = req && ['pending_approval', 'awaiting_stock'].includes(req.status);
  const plan = useApi<{ chosen: LogisticsOption | null; options: LogisticsOption[] }>(pending ? `/api/supply-requests/${id}/plan` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (path: string, body: object) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/supply-requests/${id}/${path}`, { body });
      await list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!req) return <Screen>{list.error ? <ErrorBox message={list.error} /> : <Loading />}</Screen>;
  const options = pending ? plan.data?.options : req.decision.options;
  const chosen = pending ? plan.data?.chosen : req.decision.chosen;

  return (
    <Screen refreshing={list.loading} onRefresh={() => [list.reload(), plan.reload()]}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>{req.child_name}</Text>
          <Badge text={t(`status_${req.status}`)} fg={colors.info} bg={colors.infoSoft} />
        </Row>
        {req.items.map((i) => (
          <P key={i.item_key}>
            • {i.quantity}× {i.name}
            {i.needs_doctor ? ` (${t('needsDoctor')})` : ''}
          </P>
        ))}
        <P muted>
          {t(`urgency_${req.urgency}`)} {req.locker ? `· ${req.locker.name}` : ''}
          {req.fulfillment ? ` · ${t(`via_${req.fulfillment}`)}` : ''}
        </P>
        <Button small variant="ghost" title={t('open')} icon="person-outline" onPress={() => router.push(`/child/${req.child_id}`)} />
      </Card>

      <Card>
        <H2>{t('options')}</H2>
        {pending && !plan.data && <Loading />}
        {options?.map((o, i) => {
          const isChosen = chosen && o.type === chosen.type && o.locker_code === chosen.locker_code && o.hub_name === chosen.hub_name;
          return (
            <View
              key={i}
              style={{
                borderWidth: isChosen ? 2 : 1,
                borderColor: isChosen ? colors.primary : colors.border,
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                opacity: o.feasible ? 1 : 0.55,
              }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Row>
                  <Ionicons name={ICON[o.type]} size={20} color={colors.primaryDark} />
                  <Text style={{ fontWeight: '700', color: colors.text }}>{t(`via_${o.type}`)}</Text>
                </Row>
                {isChosen ? <Badge text={t('chosen')} fg="#fff" bg={colors.primary} /> : !o.feasible ? <Badge text={t('infeasible')} fg={colors.muted} bg="#F1EFF8" /> : null}
              </Row>
              <P muted style={{ fontSize: 13 }}>
                {o.hub_name ? `${o.hub_name} → ` : ''}
                {o.locker_name}
                {o.distance_km !== undefined ? ` · ${o.distance_km} km` : ''}
                {o.type === 'locker_stock'
                  ? ` · ${o.distance_to_family_km} km ${t('fromFamily')}`
                  : ` · ${t('eta')} ${formatDuration(o.eta_minutes, lang)}`}
              </P>
              {!o.feasible && <P muted style={{ fontSize: 12 }}>⚠️ {t(`why_${o.reason}`)}</P>}
              {pending && o.feasible && !isChosen && (
                <Button small variant="ghost" title={`${t('approve')} (${t(`via_${o.type}`)})`} onPress={() => act('approve', { option_index: i })} />
              )}
            </View>
          );
        })}
      </Card>
      {error && <ErrorBox message={error} />}
      {pending && (
        <Row>
          <View style={{ flex: 1 }}>
            <Button title={t('approve')} icon="checkmark" onPress={() => act('approve', {})} loading={busy} disabled={!chosen} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('reject')} variant="ghost" icon="close" onPress={() => act('reject', { reason: '' })} loading={busy} />
          </View>
        </Row>
      )}
    </Screen>
  );
}
