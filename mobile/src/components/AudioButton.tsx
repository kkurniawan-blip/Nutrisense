import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { useAuth } from '../lib/auth';
import { colors, radius } from '../theme';
import { Text } from './Text';

/** "🔊 Dengar": reads key guidance aloud in the app language, for mothers who prefer listening to reading. */
export function AudioButton({ text, compact }: { text: string; compact?: boolean }) {
  const { t, lang } = useAuth();
  const [on, setOn] = useState(false);
  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );
  const toggle = () => {
    if (on) {
      void Speech.stop();
      setOn(false);
      return;
    }
    setOn(true);
    Speech.speak(text, {
      language: lang === 'id' ? 'id-ID' : 'en-GB',
      rate: 0.9,
      onDone: () => setOn(false),
      onStopped: () => setOn(false),
      onError: () => setOn(false),
    });
  };
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={on ? t('audioStop') : t('audioPlay')}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: compact ? 9 : 12,
        borderRadius: radius.pill,
        backgroundColor: on ? colors.primary : colors.primarySoft,
      }}
    >
      <Ionicons name={on ? 'stop' : 'volume-high'} size={17} color={on ? '#fff' : colors.primaryDark} />
      {!compact && <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : colors.primaryDark }}>{on ? t('audioStop') : t('audioPlay')}</Text>}
    </Pressable>
  );
}
