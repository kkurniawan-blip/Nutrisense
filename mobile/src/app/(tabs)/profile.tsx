import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Mascot } from '../../components/Mascot';
import { SyncBanner } from '../../components/SyncBanner';
import { Button, Card, H2, ListRow, P, Row, Screen, Segmented } from '../../components/ui';
import { getBaseUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Lang } from '../../lib/types';
import { useApi } from '../../lib/useApi';

type Consents = Record<'data_processing' | 'ai_analysis' | 'satusehat_sharing' | 'research_use', boolean>;

export default function Profile() {
  const { user, t, lang, setLang, logout } = useAuth();
  const consents = useApi<Consents>(user?.role === 'caregiver' ? '/api/consents' : null);
  const health = useApi<{ ai: { claude_enabled: boolean; model: string | null } }>('/api/health');
  const on = consents.data ? Object.values(consents.data).filter(Boolean).length : 0;

  return (
    <Screen>
      <Card tint="#FFE9E3">
        <Row style={{ gap: 12 }}>
          <Mascot size={70} mood="cheer" />
          <View style={{ flex: 1 }}>
            <H2>{user?.full_name}</H2>
            <P muted>
              {user?.email} · {user ? t(`role_${user.role}`) : ''}
            </P>
            {user?.region && <P muted>{`📍 ${user.region.name}, ${user.region.district}`}</P>}
          </View>
        </Row>
      </Card>
      <Card>
        <H2 emoji="🌏">{t('language')}</H2>
        <Segmented<Lang>
          value={lang}
          onChange={(l) => void setLang(l)}
          options={[
            { value: 'id', label: '🇮🇩 Indonesia' },
            { value: 'en', label: '🇬🇧 English' },
          ]}
        />
      </Card>
      <SyncBanner />
      <Card>
        {user?.role === 'caregiver' && (
          <ListRow emoji="🔐" title={t('dataPrivacy')} subtitle={consents.data ? `${on}/4 ${t('consentsOn')}` : t('dataPrivacySub')} onPress={() => router.push('/privacy')} />
        )}
        <ListRow emoji="🔔" title={t('notifications')} onPress={() => router.push('/notifications')} />
        <ListRow emoji="📖" title={t('healthGuide')} subtitle={t('worksOffline')} onPress={() => router.push('/guide')} />
      </Card>
      <Card>
        <P muted style={{ fontSize: 12 }}>
          {t('serverUrl')}: {getBaseUrl()}
        </P>
        <P muted style={{ fontSize: 12 }}>
          AI: {health.data?.ai.claude_enabled ? `Claude (${health.data.ai.model})` : t('aiBy_rules')}
        </P>
      </Card>
      <Button
        title={t('logout')}
        variant="ghost"
        icon="log-out-outline"
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      />
    </Screen>
  );
}
