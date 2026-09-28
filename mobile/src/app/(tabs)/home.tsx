import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KaderHome } from '../../components/KaderHome';
import { Mascot } from '../../components/Mascot';
import { SyncBanner } from '../../components/SyncBanner';
import { Text } from '../../components/Text';
import { Button, Card, Empty, ErrorBox, H2, IkatPattern, ListRow, Loading, PressScale, Row, StatusPill, Tile } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { childEmoji, formatAge, formatDate, greeting, tipOfTheDay } from '../../lib/fun';
import { motherStatus, txt } from '../../lib/status';
import type { Child, TodayChecklist } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, statusColor } from '../../theme';

function Journey({ emoji, title, subtitle, children }: { emoji: string; title: string; subtitle: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Row>
          <Text style={{ fontSize: 26 }}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{subtitle}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
        </Row>
      </Pressable>
      {open && <View style={{ marginTop: 6 }}>{children}</View>}
    </Card>
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
      {/* Greeting + child selector */}
      <View style={{ backgroundColor: colors.ink, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 30, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' }}>
        <IkatPattern />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, flexDirection: 'row' }}>
          <View style={{ flex: 3, backgroundColor: colors.primary }} />
          <View style={{ flex: 1, backgroundColor: colors.accent }} />
          <View style={{ flex: 2, backgroundColor: colors.mint }} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', flex: 1 }}>
            {greeting(lang)}, {t('mom')} {first} 👋
          </Text>
          <Pressable onPress={() => router.push('/notifications')} accessibilityLabel={t('notifications')} style={{ backgroundColor: '#ffffff1a', borderRadius: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff33' }}>
            <Ionicons name="notifications-outline" size={20} color="#fff" />
          </Pressable>
        </Row>
        {kids.length > 0 && (
          <Row style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {kids.map((c) => {
              const on = c.id === child?.id;
              return (
                <PressScale
                  key={c.id}
                  onPress={() => setPicked(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? '#fff' : '#ffffff14', borderWidth: 1, borderColor: on ? '#fff' : '#ffffff40', borderRadius: radius.md, paddingHorizontal: 14, minHeight: 44 }}
                >
                  <Text style={{ fontSize: 18 }}>{childEmoji(c.sex, c.age_months)}</Text>
                  <Text style={{ fontWeight: '900', color: on ? colors.ink : '#fff' }}>{c.name.split(' ')[0]}</Text>
                  {on && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                </PressScale>
              );
            })}
          </Row>
        )}
      </View>

      <View style={{ padding: 16, marginTop: -18 }}>
        <SyncBanner stale={children.stale || today.stale} />
        {children.error && <ErrorBox message={children.error} onRetry={children.reload} />}
        {!children.data && children.loading && <Loading />}
        {children.data?.length === 0 && (
          <Card>
            <Empty text={t('addFirstChild')} />
            <Button title={t('addChild')} icon="add" onPress={() => router.push('/child/new')} />
          </Card>
        )}

        {child && (
          <>
            {/* Main status card */}
            <Card onPress={() => router.push(`/child/${child.id}`)} style={st.key === 'urgent' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
              <Row style={{ gap: 12 }}>
                <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: child.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 30 }}>{childEmoji(child.sex, child.age_months)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 19, fontWeight: '900' }}>
                    {name} — {formatAge(child.age_months, lang)}
                  </Text>
                  <View style={{ marginTop: 4 }}>
                    <StatusPill status={st.key} label={txt(st.headline, lang)} large />
                  </View>
                </View>
              </Row>
              {m ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800' }}>
                    📏 {m.height_cm} cm · ⚖️ {m.weight_kg} kg
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {t('lastMeasured')}: {formatDate(m.measured_at, lang)}
                  </Text>
                </View>
              ) : null}
              <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }}>{t('seeProfile')} →</Text>
            </Card>

            {/* Today checklist */}
            <Card>
              <H2 emoji="🌱">
                {t('todayFor')} {name}
              </H2>
              {!today.data && today.loading && <Loading />}
              {today.data?.items.map((item) => {
                const c = statusColor[item.status];
                return (
                  <Pressable key={item.key} onPress={() => go(item.action)} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.border }}>
                    <Row>
                      <Ionicons name={item.status === 'ok' ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={c.mark} />
                      <Text style={{ flex: 1, fontWeight: item.status === 'ok' ? '600' : '800', color: item.status === 'ok' ? colors.text : c.fg }}>{item.text}</Text>
                      {item.status !== 'ok' && <Ionicons name="chevron-forward" size={18} color={c.fg} />}
                    </Row>
                  </Pressable>
                );
              })}
            </Card>

            {/* Primary actions */}
            <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <Tile emoji="📸" title="NutriScan" subtitle={t('tileNutriScanSub')} color={0} onPress={() => router.push(`/nutriscan?child=${child.id}`)} />
              <Tile emoji="📏" title={t('tileMeasure')} color={4} onPress={() => router.push(`/child/${child.id}/measure`)} />
              <Tile emoji="🤒" title={t('actCheckSymptoms')} color={5} onPress={() => router.push(`/child/${child.id}/symptoms`)} />
              <Tile emoji="💬" title={t('tileConsult')} color={3} onPress={() => router.push('/assistant')} />
            </Row>

            {/* Three journeys (secondary features) */}
            <Journey emoji="📏" title={t('jMonitor')} subtitle={t('jMonitorSub')}>
              <ListRow emoji="➕" title={t('tileMeasure')} onPress={() => router.push(`/child/${child.id}/measure`)} />
              <ListRow emoji="📈" title={t('growthHistory')} onPress={() => router.push(`/child/${child.id}/history`)} />
              <ListRow emoji="🧠" title={t('development')} onPress={() => router.push(`/child/${child.id}/development`)} />
            </Journey>
            <Journey emoji="🍽️" title={t('jNutrition')} subtitle={t('jNutritionSub')}>
              <ListRow emoji="📸" title="NutriScan" subtitle={t('tileNutriScanSub')} onPress={() => router.push(`/nutriscan?child=${child.id}`)} />
              <ListRow emoji="✍️" title={t('actLogMeal')} onPress={() => router.push(`/child/${child.id}/meal?action=manual`)} />
              <ListRow emoji="🗓️" title={t('nutritionPlan')} onPress={() => router.push(`/child/${child.id}/nutrition`)} />
              <ListRow emoji="👩‍🍳" title={t('recipes')} onPress={() => router.push(`/child/${child.id}/recipes`)} />
            </Journey>
            <Journey emoji="💬" title={t('jHelp')} subtitle={t('jHelpSub')}>
              <ListRow emoji="🤒" title={t('actCheckSymptoms')} onPress={() => router.push(`/child/${child.id}/symptoms`)} />
              <ListRow emoji="🌱" title={t('tileConsult')} onPress={() => router.push('/assistant')} />
              <ListRow emoji="📖" title={t('healthGuide')} onPress={() => router.push('/guide')} />
            </Journey>
          </>
        )}

        {/* Secondary */}
        {kids.length > 0 && (
          <>
            <Text style={{ fontWeight: '900', color: colors.muted, marginTop: 10, marginBottom: 8 }}>{t('more')}</Text>
            <Card>
              <ListRow emoji="🎁" title={t('packagesTitle')} subtitle={t('packagesSub')} onPress={() => router.push('/pickups')} />
              <ListRow emoji="➕" title={t('addChild')} onPress={() => router.push('/child/new')} />
            </Card>
            <Card tint={colors.mintSoft}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Mascot size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '900', color: colors.ok }}>💡 {t('tipTitle')}</Text>
                  <Text>{tipOfTheDay(lang)}</Text>
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

