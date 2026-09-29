import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Linking, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { colors, radius, statusColor, tones } from '../theme';
import { Text } from './Text';
import { Button, Card, PressScale } from './ui';

/** One symptom as a tappable tile: emoji in a soft circle, a short label, a tick when chosen. Danger signs are red. */
export function SymptomTile({ emoji, label, on, danger, onPress }: { emoji: string; label: string; on: boolean; danger?: boolean; onPress: () => void }) {
  const tint = danger ? colors.danger : colors.primary;
  const soft = danger ? colors.dangerSoft : colors.primarySoft;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ width: '31%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, minHeight: 100, borderRadius: radius.lg, backgroundColor: on ? soft : '#fff', borderWidth: 1.5, borderColor: on ? tint : danger ? '#F8D0D6' : colors.border }}
    >
      {on && (
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <Ionicons name="checkmark-circle" size={20} color={tint} />
        </View>
      )}
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: danger ? colors.dangerSoft : tones.pink.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', textAlign: 'center', color: on ? tint : colors.text, marginTop: 6, lineHeight: 17 }}>{label}</Text>
    </PressScale>
  );
}

/** The emergency state: short title, one line, call the Kader, and the guide as a second choice. */
export function Escalation({ phone }: { phone?: string | null }) {
  const { t } = useAuth();
  return (
    <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
      <Text style={{ fontSize: 19, fontWeight: '900', color: colors.danger }}>🚨 {t('seekHelpNow')}</Text>
      <Text style={{ marginTop: 4, fontSize: 15 }}>{t('urgentExplain')}</Text>
      {phone ? <Button variant="danger" title={t('actDiscuss')} icon="call" onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
      <Button variant="ghost" title={t('seeGuide')} icon="book-outline" onPress={() => router.push('/guide')} />
    </Card>
  );
}
