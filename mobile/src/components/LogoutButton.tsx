import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { useSync } from '../lib/sync';
import { statusColor } from '../theme';
import { Text } from './Text';
import { Button, Card, Row } from './ui';

/** Sign out. If data is still waiting to be sent, warn first: signing out clears it from this phone. */
export function LogoutButton() {
  const { t, logout } = useAuth();
  const { pending, syncing, syncNow } = useSync();
  const [confirm, setConfirm] = useState(false);

  const doLogout = async () => {
    // Always leave the account screens, even if clearing storage fails: a shared phone must not stay signed in.
    try {
      await logout();
    } catch {
      // logout() already ignores network errors; anything left is local storage, which the next login replaces.
    } finally {
      router.replace('/login');
    }
  };

  if (!confirm || pending === 0)
    return <Button title={t('logout')} variant="ghost" icon="log-out-outline" onPress={() => (pending > 0 ? setConfirm(true) : void doLogout())} />;

  return (
    <Card tint={statusColor.action.bg}>
      <Text style={{ color: statusColor.action.fg, fontWeight: '800', lineHeight: 21 }}>
        ⚠️ {pending} {t('logoutPendingWarn')}
      </Text>
      <Button small variant="secondary" title={t('syncNow')} icon="cloud-upload" loading={syncing} onPress={() => void syncNow()} />
      <Row style={{ gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button small variant="ghost" title={t('cancel')} onPress={() => setConfirm(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button small variant="danger" title={t('logoutAnyway')} onPress={() => void doLogout()} />
        </View>
      </Row>
    </Card>
  );
}
