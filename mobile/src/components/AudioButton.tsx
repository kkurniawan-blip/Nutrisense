import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { hasIndonesianVoice } from '../lib/voice';
import { colors, radius, statusColor } from '../theme';
import { Text } from './Text';
import { Icon } from './Icon';

/** "🔊 Dengar": reads key guidance aloud in the app language, for mothers who prefer listening to reading. */
export function AudioButton({ text, compact }: { text: string; compact?: boolean }) {
  const { t, lang } = useAuth();
  const [on, setOn] = useState(false);
  // Without an Indonesian voice the phone reads Indonesian with an English accent nobody can follow:
  // say how to install one instead.
  const [noVoice, setNoVoice] = useState(false);
  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );
  const toggle = async () => {
    if (on) {
      void Speech.stop();
      setOn(false);
      return;
    }
    if (lang === 'id' && !(await hasIndonesianVoice())) {
      setNoVoice(true);
      return;
    }
    setNoVoice(false);
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
    <View>
      <Pressable
        onPress={() => void toggle()}
        accessibilityRole="button"
        accessibilityLabel={on ? t('audioStop') : t('audioPlay')}
        hitSlop={6}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          minHeight: 44,
          paddingHorizontal: compact ? 9 : 12,
          minWidth: 44,
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: on ? colors.primary : colors.primarySoft,
        }}
      >
        <Icon name={on ? 'stop' : 'volume-high'} size={17} color={on ? '#fff' : colors.primaryDark} />
        {!compact && <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : colors.primaryDark }}>{on ? t('audioStop') : t('audioPlay')}</Text>}
      </Pressable>
      {noVoice ? (
        <Text accessibilityLiveRegion="polite" style={{ color: statusColor.action.fg, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
          {t('audioNoIndonesianVoice')}
        </Text>
      ) : null}
    </View>
  );
}
