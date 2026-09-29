import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Linking, View } from 'react-native';

import { useAuth } from '../lib/auth';
import type { Facility } from '../lib/types';
import { colors, radius, statusColor, tones } from '../theme';
import { AudioButton } from './AudioButton';
import { Text } from './Text';
import { Button, Card, MoreLink, PressScale, Row } from './ui';

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

/**
 * The emergency state. First: go to the Puskesmas now (its name and distance), with the Puskesmas number and 119
 * right under it. Then the Kader, then the guide. A "Dengar" button reads the instruction aloud.
 */
export function Escalation({ phone, facility }: { phone?: string | null; facility?: Facility | null }) {
  const { t, lang } = useAuth();
  const km = facility?.distance_km;
  const where = facility ? `${facility.name}${km ? ` · ± ${String(km).replace('.', lang === 'id' ? ',' : '.')} km` : ''}` : null;
  const spoken = `${t('seekHelpNow')}. ${t('goPuskesmasNow')}. ${where ?? ''}. ${t('urgentExplain')}`;
  return (
    <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ flex: 1, fontSize: 19, fontWeight: '900', color: colors.danger }}>🚨 {t('seekHelpNow')}</Text>
        <AudioButton text={spoken} compact />
      </Row>
      <Text style={{ marginTop: 4, fontSize: 15 }}>{t('urgentExplain')}</Text>
      <Button
        variant="danger"
        title={t('goPuskesmasNow')}
        icon="navigate"
        onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facility?.name ?? 'Puskesmas')}`)}
      />
      {where ? (
        <Row style={{ gap: 8, marginBottom: 4 }}>
          <Ionicons name="location" size={16} color={colors.danger} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: statusColor.urgent.fg }}>{where}</Text>
        </Row>
      ) : null}
      <Row style={{ gap: 8, alignItems: 'stretch' }}>
        {facility?.phone ? (
          <View style={{ flex: 1 }}>
            <Button small variant="ghost" title="Puskesmas" icon="call" onPress={() => Linking.openURL(`tel:${facility.phone}`)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button small variant="ghost" title={facility?.ambulance ?? '119'} icon="medical" onPress={() => Linking.openURL(`tel:${facility?.ambulance ?? '119'}`)} />
        </View>
      </Row>
      {phone ? <Button small variant="secondary" title={t('actDiscuss')} icon="chatbubbles" onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
      <MoreLink label={t('seeGuide')} onPress={() => router.push('/guide')} />
    </Card>
  );
}
