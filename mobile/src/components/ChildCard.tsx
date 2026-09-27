import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import type { Child } from '../lib/types';
import { colors } from '../theme';
import { Card, RiskBadge } from './ui';

export function ChildCard({ child }: { child: Child }) {
  const { t } = useAuth();
  const a = child.latest_assessment;
  const m = child.latest_measurement;
  const emergency = a?.triage.urgency === 'emergency';
  return (
    <Card onPress={() => router.push(`/child/${child.id}`)} style={emergency ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ backgroundColor: child.sex === 'female' ? '#FCE7F3' : '#DBEAFE', borderRadius: 24, padding: 10 }}>
          <Ionicons name={child.sex === 'female' ? 'woman' : 'man'} size={22} color={child.sex === 'female' ? '#BE185D' : '#1D4ED8'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{child.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {Math.floor(child.age_months)} {t('months')} · {child.region?.name ?? '-'}
            {m ? ` · ${m.height_cm} cm / ${m.weight_kg} kg` : ''}
          </Text>
        </View>
        <RiskBadge level={a?.risk_level} />
      </View>
      {a && a.triage.urgency !== 'routine' && (
        <Text style={{ marginTop: 8, color: emergency ? colors.danger : colors.warn, fontWeight: '600' }}>
          {t(`urgency_${a.triage.urgency}`)}
        </Text>
      )}
    </Card>
  );
}
