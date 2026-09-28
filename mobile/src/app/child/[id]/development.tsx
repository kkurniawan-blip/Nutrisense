import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../../components/Text';
import { Bubble, Card, ErrorBox, H2, Loading, Row, Screen, StatusPill } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import type { Child, Development } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, radius, statusColor } from '../../../theme';

/** Optional, simple development checklist per domain + this week's play ideas. Not a diagnostic screening. */
export default function DevelopmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const dev = useApi<Development>(`/api/children/${id}/development`);
  const [error, setError] = useState<string | null>(null);
  const name = child.data?.name.split(' ')[0] ?? '';

  const answer = async (key: string, achieved: boolean) => {
    setError(null);
    try {
      dev.setData(await api<Development>(`/api/children/${id}/development`, { body: { answers: { [key]: achieved } } }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const d = dev.data;
  if (!d) return <Screen>{dev.error ? <ErrorBox message={dev.error} /> : <Loading />}</Screen>;
  const map = { on_track: 'ok', monitor: 'monitor', unknown: 'unknown' } as const;

  return (
    <Screen>
      <Bubble mood="happy">{d.band_months ? `${t('devIntro')} ${name} (${d.band_months} ${t('months')}).` : t('devTooYoung')}</Bubble>
      {error && <ErrorBox message={error} />}
      {d.domains
        .filter((dom) => dom.items.length)
        .map((dom) => (
          <Card key={dom.key}>
            <H2 emoji={dom.emoji} right={<StatusPill status={map[dom.status]} label={t(`dev_${dom.status}`)} />}>
              {dom.label}
            </H2>
            {dom.items.map((it) => (
              <View key={it.key}>
                <Text style={{ fontWeight: '700', marginBottom: 8 }}>{it.text}</Text>
                <Row>
                  {[
                    { v: true, label: `✓ ${t('yesCan')}`, st: statusColor.ok },
                    { v: false, label: `… ${t('notYet')}`, st: statusColor.monitor },
                  ].map((o) => {
                    const on = it.achieved === o.v;
                    return (
                      <Pressable
                        key={String(o.v)}
                        onPress={() => answer(it.key, o.v)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={{ flex: 1, minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? o.st.fg : colors.border, backgroundColor: on ? o.st.bg : '#fff' }}
                      >
                        <Text style={{ fontWeight: '800', color: on ? o.st.fg : colors.text }}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </Row>
              </View>
            ))}
          </Card>
        ))}
      <Card tint={colors.accentSoft}>
        <H2 emoji="🗓️">{t('activitiesThisWeek')}</H2>
        {d.activities.map((a) => (
          <Row key={a.text} style={{ paddingVertical: 6 }}>
            <Text style={{ fontSize: 24 }}>{a.emoji}</Text>
            <Text style={{ flex: 1, fontWeight: '700' }}>{a.text}</Text>
          </Row>
        ))}
      </Card>
      <Card tint={statusColor.info.bg}>
        <Text style={{ color: statusColor.info.fg, fontWeight: '700' }}>ℹ️ {d.note}</Text>
      </Card>
    </Screen>
  );
}
