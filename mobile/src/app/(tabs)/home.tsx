import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildCard } from '../../components/ChildCard';
import { ChildPicker } from '../../components/ChildPicker';
import { Mascot } from '../../components/Mascot';
import { Text } from '../../components/Text';
import { Bubble, Button, Card, Empty, ErrorBox, H2, Loading, P, RiskBadge, Row, Tile } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { greeting, tipOfTheDay } from '../../lib/fun';
import { flush, queued } from '../../lib/offline';
import type { Child } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, shadow } from '../../theme';

interface PriorityRow {
  child_id: number;
  name: string;
  age_months: number;
  region: string;
  risk_level: 'low' | 'medium' | 'high';
  urgency: string;
  needs_review: boolean;
  top_reason: string | null;
}

function Hero({ name, subtitle }: { name: string; subtitle: string }) {
  const insets = useSafeAreaInsets();
  const { lang } = useAuth();
  return (
    <View style={{ backgroundColor: colors.primary, paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 34, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#ffffff1f', top: -60, right: -40 }} />
      <View style={{ position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFB93855', bottom: -30, left: 30 }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ffffffd9', fontWeight: '700' }}>{greeting(lang)} ☀️</Text>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{name}</Text>
          <Text style={{ color: '#fff', marginTop: 4 }}>{subtitle}</Text>
        </View>
        <Mascot size={86} mood="cheer" bounce />
      </Row>
      <Pressable
        onPress={() => router.push('/notifications')}
        style={{ position: 'absolute', top: insets.top + 8, right: 14, backgroundColor: '#fff', borderRadius: 18, padding: 7, ...shadow }}
      >
        <Ionicons name="notifications" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export default function Home() {
  const { user, t } = useAuth();
  const kader = user?.role === 'kader';
  const children = useApi<Child[]>('/api/children');
  const priority = useApi<PriorityRow[]>(kader ? '/api/dashboard/priority?limit=10' : null);
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const sync = useCallback(
    async (silent = false) => {
      const q = await queued();
      setPending(q.length);
      if (!q.length) return;
      setSyncing(true);
      try {
        const r = await flush();
        setPending(r.remaining);
        if (!silent || r.sent) setSyncMsg(`${t('synced')}: ${r.sent}${r.failed ? ` · ${t('error')}: ${r.failed}` : ''}`);
        if (r.sent) {
          void children.reload();
          void priority.reload();
        }
      } catch (e) {
        setSyncMsg(String(e));
      } finally {
        setSyncing(false);
      }
    },
    [children, priority, t],
  );

  useFocusEffect(
    useCallback(() => {
      void sync(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const refresh = () => {
    void children.reload();
    void priority.reload();
    void sync(true);
  };

  const first = (user?.full_name ?? '').replace(/^(Ibu|Bapak|Kader|dr\.)\s+/i, '').split(' ')[0];
  const kids = children.data ?? [];
  const childId = picked ?? kids[0]?.id ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView refreshControl={<RefreshControl refreshing={children.loading} onRefresh={refresh} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 40 }}>
        <Hero name={kader ? `Kader ${first}` : `${t('mom')} ${first}`} subtitle={t('howAreYou')} />
        <View style={{ padding: 16, marginTop: -20 }}>
          <Card>
            <Text style={{ fontWeight: '900', color: colors.primaryDark, marginBottom: 4 }}>💡 {t('tipTitle')}</Text>
            <P>{tipOfTheDay(user?.language ?? 'id')}</P>
          </Card>

          {pending > 0 && (
            <Card tint={colors.accentSoft}>
              <P>
                📶 {pending} {t('pendingSync')}
              </P>
              <Button small title={t('syncNow')} onPress={() => sync()} loading={syncing} icon="cloud-upload" />
            </Card>
          )}
          {syncMsg && <P muted>{syncMsg}</P>}

          {!kader && kids.length > 0 && (
            <>
              <H2 emoji="✨">{t('whatToday')}</H2>
              {kids.length > 1 && <ChildPicker items={kids} value={childId} onChange={setPicked} />}
              <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                <Tile emoji="📸" title={t('tileScan')} subtitle={t('tileScanSub')} color={0} onPress={() => router.push(`/child/${childId}/meal?action=camera`)} />
                <Tile emoji="🤖" title={t('tileConsult')} subtitle={t('tileConsultSub')} color={3} onPress={() => router.push('/assistant')} />
                <Tile emoji="📏" title={t('tileMeasure')} subtitle={t('tileMeasureSub')} color={4} onPress={() => router.push(`/child/${childId}/measure`)} />
                <Tile emoji="🌡️" title={t('tileSymptom')} subtitle={t('tileSymptomSub')} color={5} onPress={() => router.push(`/child/${childId}/symptoms`)} />
                <Tile emoji="🥗" title={t('tileNutrition')} subtitle={t('tileNutritionSub')} color={1} onPress={() => router.push(`/child/${childId}/nutrition`)} />
                <Tile emoji="🎁" title={t('tilePickup')} subtitle={t('tilePickupSub')} color={2} onPress={() => router.push('/pickups')} />
              </Row>
            </>
          )}

          {kader && (
            <>
              <Row style={{ gap: 10, marginBottom: 14 }}>
                <Tile emoji="🔓" title={t('scanPickup')} subtitle={t('scanQR')} color={2} onPress={() => router.push('/scan')} />
                <Tile emoji="➕" title={t('addChild')} subtitle={t('areaChildren')} color={1} onPress={() => router.push('/child/new')} />
              </Row>
              <H2 emoji="📋">{t('priorityList')}</H2>
              {priority.error && <ErrorBox message={priority.error} onRetry={priority.reload} />}
              {(priority.data ?? [])
                .filter((p) => p.urgency !== 'routine')
                .slice(0, 6)
                .map((p) => (
                  <Card key={p.child_id} onPress={() => router.push(`/child/${p.child_id}`)}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '900', fontSize: 16, flex: 1 }}>{p.name}</Text>
                      <RiskBadge level={p.risk_level} />
                    </Row>
                    <Text style={{ color: p.urgency === 'emergency' ? colors.danger : colors.warn, fontWeight: '800', marginTop: 4 }}>
                      {p.urgency === 'emergency' ? '🚨' : '🏠'} {t(`urgency_${p.urgency}`)} · {p.region}
                    </Text>
                    {p.top_reason && <P muted>{p.top_reason}</P>}
                  </Card>
                ))}
            </>
          )}

          <H2 emoji={kader ? '👶' : '💕'} right={!kader ? <Button small variant="secondary" title={t('addChild')} icon="add" onPress={() => router.push('/child/new')} /> : undefined}>
            {kader ? t('areaChildren') : t('myChildren')}
          </H2>
          {children.error && <ErrorBox message={children.error} onRetry={children.reload} />}
          {!children.data && children.loading && <Loading />}
          {children.data?.length === 0 && <Empty text={t('addFirstChild')} />}
          {kids.map((c) => (
            <ChildCard key={c.id} child={c} />
          ))}
          <Bubble mood="happy" tint="#fff">
            <Text style={{ color: colors.muted, fontSize: 13 }}>{t('disclaimer')}</Text>
          </Bubble>
        </View>
      </ScrollView>
    </View>
  );
}
