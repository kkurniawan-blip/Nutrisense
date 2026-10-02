import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { canOpenSettings, openSettings, PERMISSION_TEXT, PermissionState } from '../lib/camera';
import { statusColor } from '../theme';
import { Text } from './Text';
import { Button, styles } from './ui';

/**
 * Why the camera or gallery did not open, and what to do: tap again ('denied'), or switch it back on in the
 * phone's Settings ('blocked', where the phone will not ask again). Replaces silent returns, which left the
 * mother tapping a button that did nothing.
 */
export function PermissionNotice({ kind, state }: { kind: 'camera' | 'photos'; state: PermissionState | null }) {
  const { t } = useAuth();
  if (!state || state === 'granted') return null;
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <Text style={{ color: statusColor.urgent.fg, fontWeight: '600' }}>{t(PERMISSION_TEXT[kind][state])}</Text>
      {state === 'blocked' && canOpenSettings ? (
        <Button small variant="ghost" icon="settings-outline" title={t(PERMISSION_TEXT.openSettings)} onPress={() => void openSettings()} />
      ) : null}
    </View>
  );
}
