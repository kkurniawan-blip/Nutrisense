import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { LogoutButton } from '../../components/LogoutButton';
import { Mascot } from '../../components/Mascot';
import { SyncBanner } from '../../components/SyncBanner';
import { Text } from '../../components/Text';
import { Button, Card, ListRow, P, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';

type Consents = Record<'data_processing' | 'ai_analysis' | 'satusehat_sharing' | 'research_use', boolean>;

export default function Profile() {
  const { user, t } = useAuth();
  const consents = useApi<Consents>(user?.role === 'caregiver' ? '/api/consents' : null);
  const on = consents.data ? Object.values(consents.data).filter(Boolean).length : 0;

  return (
    <Screen>
      <Card>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Mascot size={80} mood="cheer" />
          <Text style={{ fontSize: 20, fontWeight: '900', textAlign: 'center' }}>{user?.full_name}</Text>
          <P muted style={{ textAlign: 'center' }}>
            {user ? t(`role_${user.role}`) : ''}
            {user?.region ? ` · 📍 ${user.region.name}` : ''}
          </P>
        </View>
        <Button small variant="secondary" title={t('editProfile')} icon="create-outline" onPress={() => router.push('/settings')} />
      </Card>
      <SyncBanner />
      <Card>
        <ListRow emoji="⚙️" title={t('settings')} onPress={() => router.push('/settings')} />
        {user?.role === 'caregiver' && (
          <ListRow emoji="🔐" title={t('dataPrivacy')} subtitle={consents.data ? `${on}/4 ${t('consentsOn')}` : undefined} onPress={() => router.push('/privacy')} />
        )}
        <ListRow emoji="🔔" title={t('notifications')} onPress={() => router.push('/notifications')} />
        <ListRow emoji="📖" title={t('healthGuide')} onPress={() => router.push('/guide')} />
      </Card>
      <LogoutButton />
    </Screen>
  );
}
