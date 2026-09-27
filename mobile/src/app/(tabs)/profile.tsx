import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Mascot } from '../../components/Mascot';
import { Button, Card, ErrorBox, H2, P, Row, Screen, Segmented, Toggle } from '../../components/ui';
import { api, errorText, getBaseUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Lang } from '../../lib/types';
import { useApi } from '../../lib/useApi';

type Consents = Record<'data_processing' | 'ai_analysis' | 'satusehat_sharing' | 'research_use', boolean>;

export default function Profile() {
  const { user, t, lang, setLang, logout } = useAuth();
  const consents = useApi<Consents>('/api/consents');
  const health = useApi<{ ai: { claude_enabled: boolean; model: string | null } }>('/api/health');
  const [error, setError] = useState<string | null>(null);

  const setConsent = async (scope: keyof Consents, granted: boolean) => {
    setError(null);
    try {
      consents.setData(await api<Consents>('/api/consents', { body: { scope, granted } }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen>
      <Card tint="#FFE9E3">
        <Row style={{ gap: 12 }}>
          <Mascot size={70} mood="cheer" />
          <View style={{ flex: 1 }}>
            <H2>{user?.full_name}</H2>
            <P muted>
              {user?.email} · {user?.role}
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
      {user?.role === 'caregiver' && consents.data && (
        <Card>
          <H2 emoji="🔒">{t('consents')}</H2>
          <Toggle label={t('consentData')} value={consents.data.data_processing} onChange={() => undefined} />
          <Toggle label={t('consentAI')} value={consents.data.ai_analysis} onChange={(v) => setConsent('ai_analysis', v)} />
          <Toggle label={t('consentSatusehat')} value={consents.data.satusehat_sharing} onChange={(v) => setConsent('satusehat_sharing', v)} />
          <Toggle label={t('consentResearch')} value={consents.data.research_use} onChange={(v) => setConsent('research_use', v)} />
        </Card>
      )}
      {error && <ErrorBox message={error} />}
      <Card>
        <P muted style={{ fontSize: 12 }}>
          {t('serverUrl')}: {getBaseUrl()}
        </P>
        <P muted style={{ fontSize: 12 }}>
          AI: {health.data?.ai.claude_enabled ? `Claude (${health.data.ai.model})` : t('aiBy_rules')}
        </P>
      </Card>
      <Button title={t('notifications')} variant="secondary" icon="notifications-outline" onPress={() => router.push('/notifications')} />
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
