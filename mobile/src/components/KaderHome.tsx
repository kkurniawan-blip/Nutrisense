import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { childEmoji, greeting } from '../lib/fun';
import { KADER_GROUPS, txt } from '../lib/status';
import type { AreaChildRow, AreaChildren, AreaGroup, OpenDangerRow, Pregnancy, RiskLevel } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors, radius, shadow, statusColor, tones } from '../theme';
import { OpenDangerCards } from './DangerAlerts';
import { SyncBanner } from './SyncBanner';
import { Text, TextInput } from './Text';
import { Mascot } from './Mascot';
import { MotherRow, RISK_ORDER } from './MotherRow';
import { Button, Card, Chip, ErrorBox, H2, Loading, MoreLink, QuickAction, Row, Section, Segmented, Source, StatusMark, StatusPill, Toggle, Wash } from './ui';
import { Icon } from './Icon';

type Filter = 'all' | 'priority' | 'new' | 'followup';
const PAGE = 30;

/** One child in the Kader's list: name, place, status and one action. Reasons live on the child's page. */
function ChildRow({ r, n }: { r: AreaChildRow; n: number }) {
  const { t, lang } = useAuth();
  const g = KADER_GROUPS[r.group];
  const urgent = r.urgency === 'emergency';
  return (
    <Card onPress={() => router.push(`/child/${r.child_id}`)} style={{ paddingVertical: 14, marginBottom: 10, ...(urgent ? { borderColor: colors.danger, borderWidth: 2 } : {}) }}>
      <Row style={{ gap: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tones.orange.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: tones.orange.fg }}>{n}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: '700', fontSize: 15 }}>
            {childEmoji(r.sex, r.age_months)} {r.name}
          </Text>
          {r.region ? <Text style={{ color: colors.muted, fontSize: 12.5 }}>📍 {r.region}</Text> : null}
          <StatusPill status={urgent ? 'urgent' : g.key} label={urgent ? t('prio_emergency') : txt(g.label, lang)} />
        </View>
        <Icon name="chevron-forward" size={22} color={colors.primary} accessibilityLabel={t('seeArrow')} />
      </Row>
    </Card>
  );
}

export function KaderHome() {
  const { user, t, lang } = useAuth();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('priority');
  const [regionId, setRegionId] = useState<number | null>(null);
  const [risk, setRisk] = useState<RiskLevel | null>(null);
  const [notMeasured, setNotMeasured] = useState<number | null>(null);
  const [visitOnly, setVisitOnly] = useState(false);
  const [q, setQ] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Extra pages, remembered per filter combination so a new filter starts from page one.
  const [extra, setExtra] = useState<{ key: string; rows: AreaChildRow[] }>({ key: '', rows: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const params = new URLSearchParams({ filter, limit: String(PAGE) });
  if (regionId) params.set('region_id', String(regionId));
  if (risk) params.set('risk', risk);
  if (notMeasured !== null) params.set('not_measured_days', String(notMeasured));
  if (visitOnly) params.set('needs_visit', 'true');
  if (q.trim()) params.set('q', q.trim());
  const query = params.toString();
  const list = useApi<AreaChildren>(`/api/dashboard/children?${query}`);
  const mothers = useApi<Pregnancy[]>('/api/pregnancies');
  // Cached like every read, so a Kader who opens the app without signal still sees who reported a danger sign.
  const dangers = useApi<OpenDangerRow[]>('/api/kader/danger-open');
  const active = (mothers.data ?? []).filter((p) => p.status === 'active');
  const topMothers = [...active].sort((a, b) => RISK_ORDER[a.risk.key] - RISK_ORDER[b.risk.key]).slice(0, 2);

  const more = extra.key === query ? extra.rows : [];

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const offset = (list.data?.rows.length ?? 0) + more.length;
      const next = await api<AreaChildren>(`/api/dashboard/children?${query}&offset=${offset}`);
      setExtra({ key: query, rows: [...more, ...next.rows] });
    } catch (e) {
      setMoreError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const d = list.data;
  const rows = [...(d?.rows ?? []), ...more];
  const extraFilters = [regionId, risk, notMeasured].filter((x) => x !== null).length + (visitOnly ? 1 : 0);
  const first = (user?.full_name ?? '').split(' ')[0];

  const pickGroup = (g: AreaGroup) => {
    // Tapping a summary tile narrows the list to that group.
    setFilter('all');
    setRisk(g === 'followup' ? 'high' : g === 'attention' ? 'medium' : 'low');
  };

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={list.loading} onRefresh={() => [list, mothers, dangers].forEach((x) => void x.reload())} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Wash height={380} />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18 }}>
        <Row style={{ justifyContent: 'space-between', gap: 12 }}>
          <Mascot size={58} mood="cheer" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontWeight: '800' }}>
              {greeting(lang)}, {first} 👋
            </Text>
            <Text style={{ color: colors.muted, fontWeight: '600', marginTop: 2 }}>
              🩺 Kader{user?.region ? ` · ${user.region.name}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={t('notifications')} style={[{ backgroundColor: '#fff', borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Icon name="notifications-outline" size={21} color={colors.primary} />
          </Pressable>
        </Row>
      </View>

      <View style={{ padding: 16 }}>
        <SyncBanner stale={list.stale || mothers.stale || dangers.stale} />

        {/* 🚨 Mothers who reported a danger sign, until someone records what happened */}
        <OpenDangerCards rows={dangers.data} error={dangers.error} onRetry={dangers.reload} />

        {/* 📊 My area */}
        <Card>
          <H2 right={d ? <Text style={{ fontSize: 15, fontWeight: '800' }}>{d.counts.total} {t('childrenCount')}</Text> : null}>
            {t('myArea')}
          </H2>
          <Row style={{ gap: 8 }}>
            {(['followup', 'attention', 'monitored'] as const).map((g) => {
              const c = statusColor[KADER_GROUPS[g].key];
              return (
                <Pressable
                  key={g}
                  onPress={() => pickGroup(g)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d?.counts[g] ?? 0} ${txt(KADER_GROUPS[g].label, lang)}`}
                  style={{ flex: 1, backgroundColor: c.bg, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 10, minHeight: 84 }}
                >
                  <Row style={{ gap: 6 }}>
                    <StatusMark status={KADER_GROUPS[g].key} size={9} />
                    <Text style={{ fontSize: 24, fontWeight: '900', color: c.fg }}>{d?.counts[g] ?? '–'}</Text>
                  </Row>
                  <Text style={{ fontSize: 12.5, color: c.fg, lineHeight: 16, marginTop: 2 }}>{txt(KADER_GROUPS[g].label, lang)}</Text>
                </Pressable>
              );
            })}
          </Row>
          {d && d.counts.unassessed > 0 && (
            <Text style={{ color: colors.muted, marginTop: 8, fontWeight: '700' }}>
              ⚪ {d.counts.unassessed} {t('notAssessedYet')}
            </Text>
          )}
          <Source label={{ id: 'Data NutriSense (demo)', en: 'NutriSense data (demo)' }} year={new Date().getFullYear()} />
        </Card>

        {/* The three jobs a Kader starts most often, one tap each */}
        <Card>
          <Row style={{ alignItems: 'flex-start', gap: 4 }}>
            <QuickAction emoji="👶" tone="blue" label={t('addChild')} onPress={() => router.push('/child/new')} />
            <QuickAction emoji="🤰" tone="pink" label={t('addMother')} onPress={() => router.push('/mother/new')} />
            <QuickAction emoji="📦" tone="orange" label={t('scanPickup')} onPress={() => router.push('/scan')} />
          </Row>
        </Card>

        {/* Priority list with filters */}
        <Section title={t('visitList')} right={<MoreLink label={`🔍 ${t('searchFilter')}`} open={searchOpen} onPress={() => setSearchOpen(!searchOpen)} />} />
        {/* Search and filters fold away, so the most urgent children are on the first screen. */}
        {(searchOpen || q.trim() !== '' || extraFilters > 0 || filter !== 'priority') && (
          <>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#E4E0F3', minHeight: 48 }}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t('searchChild')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('searchChild')}
              style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 10, fontSize: 16 }}
            />
          </View>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('filterAll') },
              { value: 'priority', label: t('filterPriority') },
              { value: 'new', label: t('filterNew') },
              { value: 'followup', label: t('filterFollowup') },
            ]}
          />
          <Pressable onPress={() => setShowMore(!showMore)} accessibilityRole="button" aria-expanded={showMore} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: colors.primary }}>
              <Icon name="options" size={16} /> {t('moreFilters')}
              {extraFilters ? ` (${extraFilters})` : ''} {showMore ? '▲' : '▼'}
            </Text>
          </Pressable>
          {showMore && (
            <Card>
              {d && d.regions.length > 1 && (
                <>
                  <Text style={{ fontWeight: '800', marginBottom: 6 }}>📍 {t('area')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    <Chip label={t('filterAll')} selected={regionId === null} onPress={() => setRegionId(null)} />
                    {d.regions.map((r) => (
                      <Chip key={r.id} label={r.name} selected={regionId === r.id} onPress={() => setRegionId(r.id)} />
                    ))}
                  </View>
                </>
              )}
              <Text style={{ fontWeight: '800', marginBottom: 6 }}>🚦 {t('riskStatus')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Chip label={t('filterAll')} selected={risk === null} onPress={() => setRisk(null)} />
                {(['high', 'medium', 'low'] as const).map((l) => (
                  <Chip key={l} emoji={statusColor[l === 'high' ? 'urgent' : l === 'medium' ? 'action' : 'ok'].dot} label={t(`risk_${l}`)} selected={risk === l} onPress={() => setRisk(l)} />
                ))}
              </View>
              <Text style={{ fontWeight: '800', marginBottom: 6 }}>📏 {t('lastMeasuredFilter')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Chip label={t('filterAll')} selected={notMeasured === null} onPress={() => setNotMeasured(null)} />
                <Chip label={`> 30 ${t('days')}`} selected={notMeasured === 30} onPress={() => setNotMeasured(30)} />
                <Chip label={`> 60 ${t('days')}`} selected={notMeasured === 60} onPress={() => setNotMeasured(60)} />
              </View>
              <Toggle label={`🏠 ${t('needsVisitOnly')}`} value={visitOnly} onChange={setVisitOnly} />
              {extraFilters > 0 && (
                <Button
                  small
                  variant="ghost"
                  title={t('clearFilters')}
                  icon="close"
                  onPress={() => {
                    setRegionId(null);
                    setRisk(null);
                    setNotMeasured(null);
                    setVisitOnly(false);
                  }}
                />
              )}
            </Card>
          )}
          </>
        )}
        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {!d && list.loading && <Loading />}
        {d && (
          <Text style={{ color: colors.muted, fontWeight: '800', marginBottom: 8 }} accessibilityLiveRegion="polite">
            {d.matched} {t('childrenCount')}
          </Text>
        )}
        {d && d.matched === 0 && (
          <Card tint={statusColor.ok.bg}>
            <Text style={{ color: statusColor.ok.fg, fontWeight: '800' }}>🎉 {t('noChildrenMatch')}</Text>
          </Card>
        )}
        {(allRows ? rows : rows.slice(0, 5)).map((r, i) => (
          <ChildRow key={r.child_id} r={r} n={i + 1} />
        ))}
        {!allRows && d && d.matched > 5 && <MoreLink label={`${t('seeAll')} (${d.matched})`} onPress={() => setAllRows(true)} />}
        {moreError && <ErrorBox message={moreError} />}
        {allRows && d && rows.length < d.matched && (
          <Button variant="secondary" title={`${t('loadMore')} (${d.matched - rows.length})`} icon="chevron-down" loading={loadingMore} onPress={loadMore} />
        )}

        {/* 🤰 Ibu hamil in my area */}
        <Card>
          <H2 emoji="🤰" right={mothers.data ? <Text style={{ fontSize: 15, fontWeight: '800' }}>{active.length} {t('mothersCount')}</Text> : null}>
            {t('pregnantMothers')}
          </H2>
          <Row style={{ gap: 8, marginBottom: 12 }}>
            {([
              ['urgent', active.filter((p) => p.risk.key === 'urgent').length, t('riskHighShort')],
              ['action', active.filter((p) => p.risk.key === 'action').length, t('riskMidShort')],
              ['unknown', active.filter((p) => p.risk.key === 'unknown').length, t('filterUnchecked')],
            ] as const).map(([k, n, lbl]) => (
              <View key={k} style={{ flex: 1, backgroundColor: statusColor[k].bg, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 10 }}>
                <Row style={{ gap: 6 }}>
                  <StatusMark status={k} size={9} />
                  <Text style={{ fontSize: 22, fontWeight: '900', color: statusColor[k].fg }}>{mothers.data ? n : '–'}</Text>
                </Row>
                <Text style={{ fontSize: 12.5, color: statusColor[k].fg, lineHeight: 16 }}>{lbl}</Text>
              </View>
            ))}
          </Row>
          {topMothers.map((p) => (
            <MotherRow key={p.id} p={p} />
          ))}
          <MoreLink label={t('seeAll')} onPress={() => router.push('/mothers')} />
        </Card>
      </View>
    </ScrollView>
  );
}
