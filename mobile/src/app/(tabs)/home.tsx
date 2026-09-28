import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KaderHome } from '../../components/KaderHome';
import { Mascot } from '../../components/Mascot';
import { SyncBanner } from '../../components/SyncBanner';
import { Text } from '../../components/Text';
import { Button, Card, Empty, ErrorBox, H2, ListRow, Loading, PressScale, QuickAction, Row, StatusPill, Tile, Wash, Wordmark } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { childEmoji, formatAge, formatDate, greeting, tipOfTheDay } from '../../lib/fun';
import { motherStatus, txt } from '../../lib/status';
import type { Child, TodayChecklist } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, shadow, statusColor, Tone, tones } from '../../theme';

/** A big pastel feature card that folds open to show its shortcuts. */
function FeatureGroup({ emoji, tone, title, subtitle, children }: { emoji: string; tone: Tone; title: string; subtitle: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: open ? 14 : 0 }}>
      <Tile emoji={emoji} tone={tone} title={title} subtitle={subtitle} open={open} onPress={() => setOpen(!open)} />
      {open && <Card style={{ marginTop: -4, paddingVertical: 6 }}>{children}</Card>}
    </View>
  );
}

function MotherHome() {
  const { user, t, lang } = useAuth();
  const insets = useSafeAreaInsets();
  const children = useApi<Child[]>('/api/children');
  const [picked, setPicked] = useState<number | null>(null);
  const kids = children.data ?? [];
  const child = kids.find((c) => c.id === picked) ?? kids[0] ?? null;
  const today = useApi<TodayChecklist>(child ? `/api/children/${child.id}/today` : null);
  const first = (user?.full_name ?? '').replace(/^(Ibu|Bapak)\s+/i, '').split(' ')[0];
  const name = child?.name.split(' ')[0] ?? '';
  const st = motherStatus(child?.latest_assessment);
  const m = child?.latest_measurement;
  const go = (action: string) => {
    if (!child) return;
    const routes: Record<string, string> = {
      measure: `/child/${child.id}/measure`,
      meal: `/child/${child.id}/meal?action=manual`,
      symptoms: `/child/${child.id}/symptoms`,
      pickups: '/pickups',
    };
    router.push(routes[action] as never);
  };

  const refresh = () => {
    void children.reload();
    void today.reload();
  };

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={children.loading} onRefresh={refresh} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 40 }}>
      <Wash height={440} />
      {/* Hero: Nuri and the NutriSense name */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', alignItems: 'flex-end' }}>
          <Pressable onPress={() => router.push('/notifications')} accessibilityLabel={t('notifications')} style={[{ backgroundColor: '#fff', borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Ionicons name="notifications-outline" size={21} color={colors.primary} />
          </Pressable>
        </View>
        <View style={{ marginTop: -18 }}>
          <Mascot size={84} mood="cheer" />
        </View>
        <Wordmark size={32} />
        <Text style={{ color: colors.muted, fontWeight: '600', marginTop: -2 }}>{t('heroTagline')}</Text>
      </View>

      <View style={{ padding: 16 }}>
        <SyncBanner stale={children.stale || today.stale} />
        {children.error && <ErrorBox message={children.error} onRetry={children.reload} />}
        {!children.data && children.loading && <Loading />}

        {/* Greeting + child selector */}
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>
            {greeting(lang)}, {t('mom')} {first} 👋
          </Text>
          {kids.length > 0 && (
            <Row style={{ marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
              {kids.map((c) => {
                const on = c.id === child?.id;
                return (
                  <PressScale
                    key={c.id}
                    onPress={() => setPicked(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: on ? colors.primarySoft : '#fff', borderWidth: 1.5, borderColor: on ? colors.primary : '#E4E0F3', borderRadius: radius.pill, paddingLeft: 5, paddingRight: 16, minHeight: 46 }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 19 }}>{childEmoji(c.sex, c.age_months)}</Text>
                    </View>
                    <Text style={{ fontWeight: '700', color: on ? colors.primaryDark : colors.text }}>{c.name.split(' ')[0]}</Text>
                  </PressScale>
                );
              })}
              <Pressable
                onPress={() => router.push('/child/new')}
                accessibilityRole="button"
                accessibilityLabel={t('addChild')}
                style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: '#DCD6F5', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="add" size={22} color={colors.primary} />
              </Pressable>
            </Row>
          )}
        </Card>

        {children.data?.length === 0 && (
          <Card>
            <Empty text={t('addFirstChild')} />
            <Button title={t('addChild')} icon="add" onPress={() => router.push('/child/new')} />
          </Card>
        )}

        {child && (
          <>
            {/* The child at a glance */}
            <Card onPress={() => router.push(`/child/${child.id}`)} style={st.key === 'urgent' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
              <Row style={{ gap: 14, alignItems: 'flex-start' }}>
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: child.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 32 }}>{childEmoji(child.sex, child.age_months)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800' }}>{child.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 14 }}>{formatAge(child.age_months, lang)}</Text>
                  <View style={{ marginTop: 4 }}>
                    <StatusPill status={st.key} label={txt(st.headline, lang)} />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#A09CB5" />
              </Row>
              {m ? (
                <>
                  <View style={{ flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderColor: colors.line }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800' }}>
                        {m.height_cm} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '600' }}>cm</Text>
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>{t('height_short')}</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: colors.line, marginHorizontal: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '800' }}>
                        {m.weight_kg} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '600' }}>kg</Text>
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>{t('weight_short')}</Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>
                    {t('lastMeasured')}: {formatDate(m.measured_at, lang)}
                  </Text>
                </>
              ) : null}
              <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }}>{t('seeProfile')} →</Text>
            </Card>

            {/* Today checklist */}
            <Card>
              <H2>
                {t('todayFor')} {name}
              </H2>
              {!today.data && today.loading && <Loading />}
              {today.data?.items.map((item) => {
                const c = statusColor[item.status];
                const done = item.status === 'ok';
                return (
                  <Pressable key={item.key} onPress={() => go(item.action)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Row style={{ gap: 10 }}>
                      <Ionicons name={done ? 'checkmark-circle' : 'alert-circle'} size={22} color={c.mark} />
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: done ? '400' : '700', color: done ? colors.text : c.fg }}>{item.text}</Text>
                      {!done && <Ionicons name="chevron-forward" size={18} color={c.fg} />}
                    </Row>
                  </Pressable>
                );
              })}
            </Card>

            {/* Quick actions */}
            <Card>
              <H2>{t('quickActions')}</H2>
              <Row style={{ alignItems: 'flex-start', gap: 4 }}>
                <QuickAction emoji="📸" tone="orange" label="NutriScan" onPress={() => router.push(`/nutriscan?child=${child.id}`)} />
                <QuickAction emoji="📏" tone="blue" label={t('tileMeasure')} onPress={() => router.push(`/child/${child.id}/measure`)} />
                <QuickAction emoji="🤒" tone="pink" label={t('actCheckSymptoms')} onPress={() => router.push(`/child/${child.id}/symptoms`)} />
                <QuickAction emoji="💬" tone="lavender" label={t('tileConsult')} onPress={() => router.push('/assistant')} />
              </Row>
            </Card>

            {/* Explore features */}
            <View style={{ marginTop: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '800' }}>{t('exploreFeatures')}</Text>
              <Text style={{ color: colors.muted }}>
                {t('exploreFor')} {name}
              </Text>
            </View>
            <FeatureGroup emoji="📈" tone="blue" title={t('jMonitor')} subtitle={t('jMonitorSub')}>
              <ListRow emoji="📏" title={t('tileMeasure')} onPress={() => router.push(`/child/${child.id}/measure`)} />
              <ListRow emoji="📈" title={t('growthHistory')} onPress={() => router.push(`/child/${child.id}/history`)} />
              <ListRow emoji="🧠" title={t('development')} onPress={() => router.push(`/child/${child.id}/development`)} />
            </FeatureGroup>
            <FeatureGroup emoji="🥗" tone="green" title={t('jNutrition')} subtitle={t('jNutritionSub')}>
              <ListRow emoji="📸" title="NutriScan" subtitle={t('tileNutriScanSub')} onPress={() => router.push(`/nutriscan?child=${child.id}`)} />
              <ListRow emoji="✍️" title={t('actLogMeal')} onPress={() => router.push(`/child/${child.id}/meal?action=manual`)} />
              <ListRow emoji="🗓️" title={t('nutritionPlan')} onPress={() => router.push(`/child/${child.id}/nutrition`)} />
              <ListRow emoji="👩‍🍳" title={t('recipes')} onPress={() => router.push(`/child/${child.id}/recipes`)} />
            </FeatureGroup>
            <FeatureGroup emoji="💬" tone="lavender" title={t('jHelp')} subtitle={t('jHelpSub')}>
              <ListRow emoji="🤒" title={t('actCheckSymptoms')} onPress={() => router.push(`/child/${child.id}/symptoms`)} />
              <ListRow emoji="💬" title={t('tileConsult')} onPress={() => router.push('/assistant')} />
              <ListRow emoji="📖" title={t('healthGuide')} onPress={() => router.push('/guide')} />
            </FeatureGroup>
            <Tile emoji="🎁" tone="orange" title={t('pkgCardTitle')} subtitle={t('pkgCardSub')} onPress={() => router.push('/pickups')} />

            <Card tint={tones.yellow.bg} style={{ marginTop: 4 }}>
              <Row style={{ alignItems: 'flex-start', gap: 12 }}>
                <Mascot size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: tones.yellow.fg }}>💡 {t('tipTitle')}</Text>
                  <Text style={{ lineHeight: 22 }}>{tipOfTheDay(lang)}</Text>
                </View>
              </Row>
            </Card>
            <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>{t('disclaimer')}</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {user?.role === 'kader' ? <KaderHome /> : <MotherHome />}
    </View>
  );
}

