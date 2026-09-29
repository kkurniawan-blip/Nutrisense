import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { colors, radius, tones } from '../theme';
import { Text } from './Text';
import { PressScale } from './ui';

/** A big tick box for today: tap to mark, tap again to undo. `warn` for a tick that is not good news (orange). */
export function TodayBox({ emoji, title, on, note, onPress, warn }: { emoji: string; title: string; on: boolean; note?: string; onPress: () => void; warn?: boolean }) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={title}
      style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16, paddingHorizontal: 8, borderRadius: radius.lg, borderWidth: 1.5, borderColor: on ? (warn ? colors.accent : colors.mint) : colors.border, backgroundColor: on ? (warn ? colors.warnSoft : colors.mintSoft) : '#fff' }}
    >
      {on && (
        <View style={{ position: 'absolute', top: 8, right: 8 }}>
          <Ionicons name="checkmark-circle" size={22} color={warn ? colors.accent : colors.mint} />
        </View>
      )}
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: on ? '#fff' : tones.pink.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
      </View>
      <Text style={{ fontWeight: '700', textAlign: 'center', color: on ? (warn ? colors.warn : colors.ok) : colors.text }}>{title}</Text>
      {note ? <Text style={{ fontSize: 12, color: colors.warn, textAlign: 'center' }}>{note}</Text> : null}
    </PressScale>
  );
}

