import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KaderHome } from '../../components/KaderHome';
import { Mascot } from '../../components/Mascot';
import { PregnancyHome } from '../../components/PregnancyHome';
import { SyncBanner } from '../../components/SyncBanner';
import { Text } from '../../components/Text';
import { Button, Card, Empty, ErrorBox, IconChip, ListRow, Loading, PressScale, QuickAction, Row, Section, StatusPill, Tile, Wash } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { childEmoji, formatAge, formatDate, greeting } from '../../lib/fun';
import { motherStatus, txt } from '../../lib/status';
import type { Child, Facility, Posyandu, Pregnancy, TodayChecklist } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, glass, radius, statusColor, Tone } from '../../theme';

/** A big pastel feature card that folds open to show its shortcuts. */
function FeatureGroup({ emoji, tone, title, children }: { emoji: string; tone: Tone; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: open ? 14 : 0 }}>
      <Tile emoji={emoji} tone={tone} title={title} open={open} onPress={() => setOpen(!open)} />
      {open && <Card style={{ marginTop: -4, paddingVertical: 6 }}>{children}</Card>}
    </View>
  );
}

/** "Posyandu berikutnya": the date and how many days to go. */
function PosyanduCard({ p }: { p: Posyandu }) {
  const { t, lang } = useAuth();
  return (
    <Card style={{ paddingVertical: 14 }}>
      <Row style={{ gap: 12 }}>
        <IconChip emoji="📅" size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700' }}>{t('nextPosyandu')}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {formatDate(p.date, lang)} · {p.place}
          </Text>
        </View>
        <StatusPill status="info" label={p.days === 0 ? t('todayLbl') : `${p.days} ${t('daysLeft')}`} />
      </Row>
    </Card>
  );
}

function MotherHome() {
  const { user, t, lang } = useAuth();
  const insets = useSafeAreaInsets();
  const children = useApi<Child[]>('/api/children');
  const pregnancies = useApi<Pregnancy[]>('/api/pregnancies');
  const local = useApi<{ facility: Facility | null; posyandu: Posyandu | null }>('/api/local');
  const [picked, setPicked] = useState<number | 'mom' | null>(null);
  const [adding, setAdding] = useState(false);
  const kids = children.data ?? [];
  const preg = pregnancies.data?.[0] ?? null;
  // "Bunda" is shown when picked, or when there is a pregnancy and no child yet.
  const momOn = !!preg && (picked === 'mom' || (picked === null && kids.length === 0));
  const child = momOn ? null : (kids.find((c) => c.id === picked) ?? kids[0] ?? null);
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
      asi: `/child/${child.id}/asi`,
      kia: `/child/${child.id}/kia`,
      symptoms: `/child/${child.id}/symptoms`,
      pickups: '/pickups',
    };
    router.push(routes[action] as never);
  };

  const refresh = () => {
    void children.reload();
    void pregnancies.reload();
    void today.reload();
    void local.reload();
  };

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={children.loading} onRefresh={refresh} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 40 }}>
      <Wash height={420} />
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18 }}>
        {/* Greeting */}
        <Row style={{ gap: 10 }}>
          <Mascot size={46} mood="cheer" />
          <Text style={{ flex: 1, fontSize: 19, fontWeight: '800', lineHeight: 25 }}>
            {greeting(lang)}, {t('mom')} {first} 👋
          </Text>
          <Pressable onPress={() => router.push('/notifications')} accessibilityLabel={t('notifications')} style={[{ borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, glass]}>
            <Ionicons name="notifications-outline" size={21} color={colors.primary} />
          </Pressable>
        </Row>

        {/* Child selector, with the mother's card when she is pregnant */}
        {(kids.length > 0 || preg) && (
          <Row style={{ marginTop: 16, flexWrap: 'wrap', gap: 6 }}>
            {kids.map((c) => {
              const on = c.id === child?.id;
              return (
                <PressScale
                  key={c.id}
                  onPress={() => setPicked(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingLeft: 5, paddingRight: 12, minHeight: 44 }, on ? { backgroundColor: colors.primary } : glass]}
                >
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: on ? '#ffffff33' : c.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{childEmoji(c.sex, c.age_months)}</Text>
                  </View>
                  <Text style={{ fontWeight: '700', color: on ? '#fff' : colors.text }}>{c.name.split(' ')[0]}</Text>
                </PressScale>
              );
            })}
            {preg && (
              <PressScale
                onPress={() => setPicked('mom')}
                accessibilityRole="button"
                accessibilityState={{ selected: momOn }}
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingLeft: 5, paddingRight: 12, minHeight: 44 }, momOn ? { backgroundColor: colors.primary } : glass]}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: momOn ? '#ffffff33' : colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>🤰</Text>
                </View>
                <Text style={{ fontWeight: '700', color: momOn ? '#fff' : colors.text }}>{t('momPill')}</Text>
              </PressScale>
            )}
            <Pressable
              onPress={() => setAdding(!adding)}
              accessibilityRole="button"
              accessibilityState={{ expanded: adding }}
              accessibilityLabel={`${t('addChild')} / ${t('addPregnancy')}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1.5,
                borderColor: adding ? colors.primary : '#CFC8F2',
                borderStyle: adding ? 'solid' : 'dashed',
                backgroundColor: adding ? colors.primarySoft : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="add" size={22} color={colors.primary} />
            </Pressable>
          </Row>
        )}
        {adding && (
          <Row style={{ gap: 8, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button small variant="secondary" title={t('addChild')} icon="add" onPress={() => router.push('/child/new')} />
            </View>
            {preg?.status !== 'active' ? (
              <View style={{ flex: 1 }}>
                <Button small variant="secondary" title={t('addPregnancy')} icon="heart" onPress={() => router.push('/pregnancy/new')} />
              </View>
            ) : null}
          </Row>
        )}
      </View>

      <View style={{ padding: 18, paddingTop: 16 }}>
        <SyncBanner stale={children.stale || today.stale} />
        {children.error && <ErrorBox message={children.error} onRetry={children.reload} />}
        {!children.data && children.loading && <Loading />}

        {children.data?.length === 0 && pregnancies.data && !preg && (
          <Card>
            <Empty text={t('addFirstChild')} />
            <Button title={t('addChild')} icon="add" onPress={() => router.push('/child/new')} />
            <Button title={t('addPregnancy')} icon="heart" variant="secondary" onPress={() => router.push('/pregnancy/new')} />
          </Card>
        )}

        {momOn && preg && <PregnancyHome p={preg} />}
        {momOn && local.data?.posyandu && <PosyanduCard p={local.data.posyandu} />}

        {child && (
          <>
            {/* How is my child? */}
            <Card onPress={() => router.push(`/child/${child.id}`)} style={st.key === 'urgent' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
              <Row style={{ gap: 14 }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: child.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 32 }}>{childEmoji(child.sex, child.age_months)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800' }}>{name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{formatAge(child.age_months, lang)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#A09CB5" />
              </Row>
              <Row style={{ marginTop: 14, flexWrap: 'wrap', gap: 6 }}>
                <StatusPill status={st.key} label={txt(st.headline, lang)} large />
                {child.weight_gain?.two_t ? <StatusPill status="action" label={t('twoTBadge')} large /> : null}
              </Row>
              {m ? (
                <Text style={{ fontSize: 22, fontWeight: '900', marginTop: 12 }}>
                  {m.height_cm} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '500' }}>cm</Text>
                  <Text style={{ color: '#C9C4DD' }}> · </Text>
                  {m.weight_kg} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '500' }}>kg</Text>
                </Text>
              ) : null}
            </Card>

            {/* What should I do today? */}
            <Section title={t('forToday')} />
            <Card>
              {!today.data && today.loading && <Loading />}
              {today.data?.items.map((item) => {
                const c = statusColor[item.status];
                const done = item.status === 'ok';
                return (
                  <Pressable key={item.key} onPress={() => go(item.action)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Row style={{ gap: 10 }}>
                      <Ionicons name={done ? 'checkmark-circle' : 'alert-circle'} size={21} color={c.mark} />
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: done ? '400' : '700', color: done ? colors.text : c.fg }}>{item.text}</Text>
                      {!done && <Ionicons name="chevron-forward" size={18} color={c.fg} />}
                    </Row>
                  </Pressable>
                );
              })}
            </Card>

            {local.data?.posyandu && <PosyanduCard p={local.data.posyandu} />}

            {/* Quick actions: ASI instead of meals before 6 months */}
            <Row style={{ alignItems: 'flex-start', gap: 4, marginTop: 4, marginBottom: 20 }}>
              {child.age_months < 6 ? (
                <QuickAction emoji="🤱" tone="pink" label={t('asiTitle')} onPress={() => router.push(`/child/${child.id}/asi`)} />
              ) : (
                <QuickAction emoji="📸" tone="orange" label={t('actLogMeal')} onPress={() => router.push(`/child/${child.id}/meal?action=manual`)} />
              )}
              <QuickAction emoji="📏" tone="blue" label={t('tileMeasure')} onPress={() => router.push(`/child/${child.id}/measure`)} />
              <QuickAction emoji="🤒" tone="pink" label={t('actCheckSymptoms')} onPress={() => router.push(`/child/${child.id}/symptoms`)} />
              <QuickAction emoji="💬" tone="lavender" label={t('tileConsult')} onPress={() => router.push('/assistant')} />
            </Row>

            {/* Explore features */}
            <Section title={t('exploreFeatures')} />
            <FeatureGroup emoji="📈" tone="blue" title={t('jMonitor')}>
              <ListRow emoji="📏" title={t('tileMeasure')} onPress={() => router.push(`/child/${child.id}/measure`)} />
              <ListRow emoji="📈" title={t('growthHistory')} onPress={() => router.push(`/child/${child.id}/history`)} />
              <ListRow emoji="🧠" title={t('development')} onPress={() => router.push(`/child/${child.id}/development`)} />
              <ListRow emoji="💉" title={t('kiaTitle')} onPress={() => router.push(`/child/${child.id}/kia`)} />
            </FeatureGroup>
            <FeatureGroup emoji="🥗" tone="green" title={t('jNutrition')}>
              {child.age_months < 6 ? (
                <ListRow emoji="🤱" title={t('asiTitle')} onPress={() => router.push(`/child/${child.id}/asi`)} />
              ) : (
                <>
                  <ListRow emoji="📸" title="NutriScan" onPress={() => router.push(`/nutriscan?child=${child.id}`)} />
                  <ListRow emoji="✍️" title={t('actLogMeal')} onPress={() => router.push(`/child/${child.id}/meal?action=manual`)} />
                  <ListRow emoji="🗓️" title={t('nutritionPlan')} onPress={() => router.push(`/child/${child.id}/nutrition`)} />
                  <ListRow emoji="👩‍🍳" title={t('recipes')} onPress={() => router.push(`/child/${child.id}/recipes`)} />
                </>
              )}
            </FeatureGroup>
            <FeatureGroup emoji="💬" tone="lavender" title={t('jHelp')}>
              <ListRow emoji="🤒" title={t('actCheckSymptoms')} onPress={() => router.push(`/child/${child.id}/symptoms`)} />
              <ListRow emoji="💬" title={t('tileConsult')} onPress={() => router.push('/assistant')} />
              <ListRow emoji="📖" title={t('healthGuide')} onPress={() => router.push('/guide')} />
            </FeatureGroup>
            <Tile emoji="🎁" tone="orange" title={t('pkgCardTitle')} onPress={() => router.push('/pickups')} />

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

