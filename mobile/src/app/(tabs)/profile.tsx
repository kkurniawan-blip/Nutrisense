import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { LogoutButton } from '../../components/LogoutButton';
import { Mascot } from '../../components/Mascot';
import { SyncBanner } from '../../components/SyncBanner';
import { Button, Card, H2, ListRow, P, Row, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';

type Consents = Record<'data_processing' | 'ai_analysis' | 'satusehat_sharing' | 'research_use', boolean>;

export default function Profile() {
  const { user, t, lang } = useAuth();
  const consents = useApi<Consents>(user?.role === 'caregiver' ? '/api/consents' : null);
  const on = consents.data ? Object.values(consents.data).filter(Boolean).length : 0;

  return (
    <Screen>
      <Card>
        <Row style={{ gap: 12 }}>
          <Mascot size={70} mood="cheer" />
          <View style={{ flex: 1 }}>
            <H2>{user?.full_name}</H2>
            <P muted>
              {user?.email} · {user ? t(`role_${user.role}`) : ''}
            </P>
            {user?.region && <P muted>{`📍 ${user.region.name}, ${user.region.district}`}</P>}
            {user?.phone ? <P muted>{`📱 ${user.phone}`}</P> : null}
          </View>
        </Row>
        <Button small variant="secondary" title={t('editProfile')} icon="create-outline" onPress={() => router.push('/settings')} />
      </Card>
      <SyncBanner />
      <Card>
        <ListRow emoji="⚙️" title={t('settings')} subtitle={t('settingsSub')} onPress={() => router.push('/settings')} />
        {user?.role === 'caregiver' && (
          <ListRow emoji="🔐" title={t('dataPrivacy')} subtitle={consents.data ? `${on}/4 ${t('consentsOn')}` : t('dataPrivacySub')} onPress={() => router.push('/privacy')} />
        )}
        <ListRow emoji="🔔" title={t('notifications')} onPress={() => router.push('/notifications')} />
        <ListRow emoji="📖" title={t('healthGuide')} subtitle={t('worksOffline')} onPress={() => router.push('/guide')} />
      </Card>
      <P muted style={{ fontSize: 12, textAlign: 'center' }}>
        {lang === 'id' ? '🇮🇩 Bahasa Indonesia' : '🇬🇧 English'} · {t('changeInSettings')}
      </P>
      <LogoutButton />
    </Screen>
  );
}
