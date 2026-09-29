import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { useSync } from '../lib/sync';
import { statusColor } from '../theme';
import { Text } from './Text';
import { Button, MoreLink } from './ui';

/** Always-honest sync status: queued items, successful sync, or "showing saved data". */
export function SyncBanner({ stale }: { stale?: boolean }) {
  const { t } = useAuth();
  const { pending, syncing, justSynced, syncNow } = useSync();
  if (justSynced > 0 && pending === 0) {
    const c = statusColor.ok;
    return (
      <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.bg, borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <Text style={{ color: c.fg, fontWeight: '800' }}>✓ {t('syncedOk')}</Text>
        <MoreLink label={t('syncStatus')} onPress={() => router.push('/sync')} />
      </View>
    );
  }
  if (pending > 0) {
    const c = statusColor.info;
    return (
      <View style={{ backgroundColor: c.bg, borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <Text style={{ color: c.fg, fontWeight: '800' }}>
          📶 {pending} {t('pendingSync')}
        </Text>
        <Text style={{ color: c.fg, fontSize: 13, marginBottom: 4 }}>{t('willSyncAuto')}</Text>
        <Button small variant="ghost" title={t('syncNow')} icon="cloud-upload" loading={syncing} onPress={() => void syncNow()} />
        <MoreLink label={t('syncStatus')} onPress={() => router.push('/sync')} />
      </View>
    );
  }
  if (stale) {
    const c = statusColor.unknown;
    return (
      <View style={{ backgroundColor: c.bg, borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <Text style={{ color: c.fg, fontWeight: '700' }}>📴 {t('showingSaved')}</Text>
      </View>
    );
  }
  return null;
}
