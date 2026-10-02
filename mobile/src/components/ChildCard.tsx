import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { childEmoji, formatAge } from '../lib/fun';
import type { Child } from '../lib/types';
import { colors } from '../theme';
import { Text } from './Text';
import { Card, RiskBadge } from './ui';
import { Icon } from './Icon';

export function ChildCard({ child }: { child: Child }) {
  const { t, lang } = useAuth();
  const a = child.latest_assessment;
  const m = child.latest_measurement;
  const emergency = a?.triage.urgency === 'emergency';
  const girl = child.sex === 'female';
  return (
    <Card onPress={() => router.push(`/child/${child.id}`)} style={emergency ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            backgroundColor: girl ? colors.pinkSoft : colors.skySoft,
            borderRadius: 30,
            width: 60,
            height: 60,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: girl ? colors.pink : colors.sky,
          }}
        >
          <Text style={{ fontSize: 30 }}>{childEmoji(child.sex, child.age_months)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '900' }}>{child.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 4 }}>
            🎂 {formatAge(child.age_months, lang)}
            {m ? `  ·  📏 ${m.height_cm} cm  ·  ⚖️ ${m.weight_kg} kg` : ''}
          </Text>
          <RiskBadge level={a?.risk_level} />
        </View>
        <Icon name="chevron-forward-circle" size={28} color={colors.primary} />
      </View>
      {a && a.triage.urgency !== 'routine' && (
        <View style={{ marginTop: 10, backgroundColor: emergency ? colors.dangerSoft : colors.warnSoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ color: emergency ? colors.danger : colors.warn, fontWeight: '800' }}>
            {emergency ? '🚨 ' : '💛 '}
            {t(`urgency_${a.triage.urgency}`)}
          </Text>
        </View>
      )}
    </Card>
  );
}
