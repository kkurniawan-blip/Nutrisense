import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { VISIT_STATUS } from '../lib/pregnancy';
import type { Pregnancy } from '../lib/types';
import { colors } from '../theme';
import { Text } from './Text';
import { Card, Row, StatusPill } from './ui';

export const RISK_ORDER = { urgent: 0, action: 1, monitor: 2, unknown: 3, ok: 4 } as const;

/** One pregnant mother in the Kader's list: name, village, weeks, level and the next visit. Same shape as the child row. */
export function MotherRow({ p }: { p: Pregnancy }) {
  const { t, lang } = useAuth();
  const urgent = p.risk.key === 'urgent';
  return (
    <Card onPress={() => router.push(`/pregnancy/${p.id}`)} style={{ paddingVertical: 14, marginBottom: 10, ...(urgent ? { borderColor: colors.danger, borderWidth: 2 } : {}) }}>
      <Row style={{ gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>🤰</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: '700', fontSize: 15 }}>{p.mother_name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>
            {p.status === 'delivered' ? t('nifasPeriod') : `${p.gestational_weeks} ${t('weeksWord')}`}
            {p.region ? ` · 📍 ${p.region.name}` : ''}
          </Text>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            <StatusPill status={p.risk.key} label={p.risk.reasons.length && p.risk.key !== 'unknown' ? `${p.risk.label} · ${p.risk.reasons[0]}` : p.risk.label} />
            {p.next_anc && p.next_anc.status !== 'upcoming' ? (
              <StatusPill status={VISIT_STATUS[p.next_anc.status].key} label={`K${p.next_anc.number} ${VISIT_STATUS[p.next_anc.status].label[lang].toLowerCase()}`} />
            ) : null}
          </Row>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.primary} accessibilityLabel={t('seeArrow')} />
      </Row>
    </Card>
  );
}
