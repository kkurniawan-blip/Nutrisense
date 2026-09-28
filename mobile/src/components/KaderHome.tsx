import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { childEmoji, formatAge, greeting } from '../lib/fun';
import { KADER_GROUPS, txt } from '../lib/status';
import type { AreaChildRow, AreaChildren, AreaGroup, RiskLevel } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors, radius, statusColor } from '../theme';
import { SyncBanner } from './SyncBanner';
import { Text, TextInput } from './Text';
import { Button, Card, Chip, ErrorBox, H2, IkatPattern, Loading, Row, Segmented, StatusMark, StatusPill, Toggle } from './ui';

type Filter = 'all' | 'priority' | 'new' | 'followup';
const PAGE = 30;

/** One child in the Kader's list: status (icon + text + colour), why, when last measured, and one clear action. */
function ChildRow({ r }: { r: AreaChildRow }) {
  const { t, lang } = useAuth();
  const g = KADER_GROUPS[r.group];
  const urgent = r.urgency === 'emergency';
  return (
    <Card style={urgent ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: r.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>{childEmoji(r.sex, r.age_months)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>{r.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {formatAge(r.age_months, lang)}
            {r.region ? ` · 📍 ${r.region}` : ''}
          </Text>
          <View style={{ marginTop: 6 }}>
            <StatusPill status={urgent ? 'urgent' : g.key} label={urgent ? t('urgentReferral') : txt(g.label, lang)} />
          </View>
        </View>
      </Row>
      {r.reason ? <Text style={{ marginTop: 8, lineHeight: 21, fontWeight: '600' }}>{r.reason}</Text> : null}
      <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <Text style={{ color: r.days_since_measured === null || r.days_since_measured > 35 ? statusColor.action.fg : colors.muted, fontSize: 13, fontWeight: '700' }}>
          📏 {r.days_since_measured === null ? t('neverMeasured') : r.days_since_measured === 0 ? t('measuredToday') : `${t('measured')} ${r.days_since_measured} ${t('daysAgo')}`}
        </Text>
        {r.open_case && <StatusPill status="info" label={`📂 ${t('openCase')}`} />}
        {r.needs_visit && <StatusPill status="monitor" label={`🏠 ${t('needsVisit')}`} />}
        {r.is_new && <StatusPill status="ai" label={`✨ ${t('filterNew')}`} />}
      </Row>
      <Button small title={t('seeChild')} icon="arrow-forward" onPress={() => router.push(`/child/${r.child_id}`)} />
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
      refreshControl={<RefreshControl refreshing={list.loading} onRefresh={() => void list.reload()} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ backgroundColor: colors.ink, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 30, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' }}>
        <IkatPattern />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, flexDirection: 'row' }}>
          <View style={{ flex: 3, backgroundColor: colors.primary }} />
          <View style={{ flex: 1, backgroundColor: colors.accent }} />
          <View style={{ flex: 2, backgroundColor: colors.mint }} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>
              {greeting(lang)}, {first} 👋
            </Text>
            <Text style={{ color: '#ffffffcc', fontWeight: '700', marginTop: 2 }}>
              🩺 Kader{user?.region ? ` · ${user.region.name}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/notifications')} accessibilityLabel={t('notifications')} style={{ backgroundColor: '#ffffff1a', borderRadius: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff33' }}>
            <Ionicons name="notifications-outline" size={20} color="#fff" />
          </Pressable>
        </Row>
      </View>

      <View style={{ padding: 16, marginTop: -18 }}>
        <SyncBanner stale={list.stale} />

        {/* 📊 My area */}
        <Card>
          <H2 emoji="📊" right={d ? <Text style={{ color: colors.muted, fontWeight: '800' }}>{d.counts.total} {t('childrenCount')}</Text> : null}>
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
                  style={{ flex: 1, backgroundColor: c.bg, borderRadius: radius.md, padding: 10, minHeight: 88 }}
                >
                  <Text style={{ fontSize: 30, fontWeight: '900', color: c.fg }}>{d?.counts[g] ?? '–'}</Text>
                  <Row style={{ gap: 6, alignItems: 'flex-start' }}>
                    <View style={{ marginTop: 5 }}>
                      <StatusMark status={KADER_GROUPS[g].key} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: c.fg, flex: 1 }}>{txt(KADER_GROUPS[g].label, lang)}</Text>
                  </Row>
                </Pressable>
              );
            })}
          </Row>
          {d && d.counts.unassessed > 0 && (
            <Text style={{ color: colors.muted, marginTop: 8, fontWeight: '700' }}>
              ⚪ {d.counts.unassessed} {t('notAssessedYet')}
            </Text>
          )}
        </Card>

        <Row style={{ gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Button small variant="secondary" title={t('addChild')} icon="person-add" onPress={() => router.push('/child/new')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button small variant="secondary" title={t('scanPickup')} icon="qr-code" onPress={() => router.push('/scan')} />
          </View>
        </Row>

        {/* Priority list with filters */}
        <H2 emoji="🏠">{t('visitList')}</H2>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1.5, borderColor: colors.border, minHeight: 48 }}>
          <Ionicons name="search" size={18} color={colors.muted} />
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
        <Pressable onPress={() => setShowMore(!showMore)} accessibilityRole="button" accessibilityState={{ expanded: showMore }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontWeight: '800', color: colors.primaryDark }}>
            <Ionicons name="options" size={16} /> {t('moreFilters')}
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
        {rows.map((r) => (
          <ChildRow key={r.child_id} r={r} />
        ))}
        {moreError && <ErrorBox message={moreError} />}
        {d && rows.length < d.matched && (
          <Button variant="secondary" title={`${t('loadMore')} (${d.matched - rows.length})`} icon="chevron-down" loading={loadingMore} onPress={loadMore} />
        )}
      </View>
    </ScrollView>
  );
}
