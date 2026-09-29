import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../../components/Text';
import { TodayBox } from '../../../components/TodayBox';
import { Bar, Bubble, Button, Card, Chip, ErrorBox, H2, Loading, Row, Screen, Source, StatusPill } from '../../../components/ui';
import { errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatAge, formatDate } from '../../../lib/fun';
import { saveOrQueue } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import type { AsiTracker, Child } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor } from '../../../theme';

const OTHER: { key: string; emoji: string; id: string; en: string }[] = [
  { key: 'water', emoji: '💧', id: 'Air putih', en: 'Water' },
  { key: 'formula', emoji: '🍼', id: 'Susu formula', en: 'Formula' },
  { key: 'honey', emoji: '🍯', id: 'Madu', en: 'Honey' },
  { key: 'rice_water', emoji: '🍚', id: 'Air tajin', en: 'Rice water' },
  { key: 'food', emoji: '🥣', id: 'Makanan', en: 'Food' },
  { key: 'other', emoji: '➕', id: 'Lainnya', en: 'Other' },
];

const today = () => new Date().toISOString().slice(0, 10);

/** ASI eksklusif (0-5 months): today's tick, how often, the last 7 days, and the way to 6 months. Replaces the meal log. */
export default function AsiScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const sync = useSync();
  const child = useApi<Child>(`/api/children/${id}`);
  const q = useApi<AsiTracker>(`/api/children/${id}/asi`);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const a = q.data;
  const c = child.data;
  if (!a || !c) return <Screen>{q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;
  const name = c.name.split(' ')[0];
  const day = a.today;

  const save = async (next: { asi_only: boolean; feeds?: number | null; other?: string[] }) => {
    setError(null);
    const body = { day: today(), asi_only: next.asi_only, feeds: next.feeds ?? day?.feeds ?? null, other: next.other ?? (next.asi_only ? [] : (day?.other ?? [])) };
    // Show the tick at once, also when the phone is offline.
    q.setData({ ...a, today: { asi_only: body.asi_only, feeds: body.feeds, other: body.other } });
    try {
      const r = await saveOrQueue<AsiTracker>('asi', Number(id), c.name, `/api/children/${id}/asi`, body);
      if (r) q.setData(r);
      else {
        setQueued(true);
        await sync.refresh();
      }
    } catch (e) {
      setError(errorText(e));
    }
  };
  const toggleOther = (k: string) => {
    const cur = day?.other ?? [];
    void save({ asi_only: false, other: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };
  const feeds = day?.feeds ?? 0;
  const dayName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { weekday: 'short' });

  if (!a.in_window)
    return (
      <Screen>
        <Bubble mood="cheer" audio>
          {t('asiDone')}
        </Bubble>
        <Button title={t('actLogMeal')} icon="restaurant" onPress={() => router.replace(`/child/${id}/meal?action=manual`)} />
      </Screen>
    );

  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <Bubble mood="happy" audio={`${t('asiBubble')} ${t('asiFeedsHint')}`}>
        {t('asiBubble')}
      </Bubble>
      {error && <ErrorBox message={error} />}
      {queued && (
        <Card tint={statusColor.info.bg}>
          <Text style={{ fontWeight: '800', color: statusColor.info.fg }}>📶 {t('savedOnPhone')}</Text>
        </Card>
      )}

      <Row style={{ gap: 10, marginBottom: 16, alignItems: 'stretch' }}>
        <TodayBox emoji="🤱" title={t('asiOnlyToday')} on={day?.asi_only === true} onPress={() => void save({ asi_only: true })} />
        <TodayBox emoji="🍼" title={t('asiOtherToday')} warn on={day?.asi_only === false} onPress={() => void save({ asi_only: false })} />
      </Row>

      {day?.asi_only === false && (
        <Card tint={statusColor.monitor.bg}>
          <H2>{t('asiWhatElse')}</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {OTHER.map((o) => (
              <Chip key={o.key} emoji={o.emoji} label={o[lang]} selected={day.other.includes(o.key)} onPress={() => toggleOther(o.key)} />
            ))}
          </View>
          <Text style={{ color: statusColor.monitor.fg, fontWeight: '600' }}>💡 {t('asiBackTip')}</Text>
        </Card>
      )}

      <Card>
        <H2>{t('asiFeeds')}</H2>
        <Row style={{ justifyContent: 'center', gap: 22 }}>
          <Pressable
            onPress={() => void save({ asi_only: day?.asi_only ?? true, feeds: Math.max(0, feeds - 1) })}
            accessibilityRole="button"
            accessibilityLabel="−"
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="remove" size={26} color={colors.primaryDark} />
          </Pressable>
          <Text style={{ fontSize: 34, fontWeight: '900', minWidth: 60, textAlign: 'center' }}>
            {feeds}
            <Text style={{ fontSize: 15, color: colors.muted, fontWeight: '600' }}> ×</Text>
          </Text>
          <Pressable
            onPress={() => void save({ asi_only: day?.asi_only ?? true, feeds: feeds + 1 })}
            accessibilityRole="button"
            accessibilityLabel="+"
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
        </Row>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 8 }}>{t('asiFeedsHint')}</Text>
      </Card>

      <Card>
        <H2>{t('last7Days')}</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          {a.week.map((d) => (
            <View key={d.day} style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: d.asi_only === true ? colors.mint : d.asi_only === false ? colors.accent : colors.line,
                }}
              >
                {d.asi_only === true ? <Ionicons name="checkmark" size={17} color="#fff" /> : d.asi_only === false ? <Text style={{ color: '#fff', fontWeight: '900' }}>!</Text> : null}
              </View>
              <Text style={{ fontSize: 11, color: colors.muted }}>{dayName(d.day)}</Text>
            </View>
          ))}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontWeight: '800' }}>
            {name} · {formatAge(a.age_months, lang)}
          </Text>
          {a.broken ? <StatusPill status="monitor" label={t('asiNotExclusive')} /> : <StatusPill status="ok" label={`${a.streak} ${t('daysAsiOnly')}`} />}
        </Row>
        <Bar pct={(a.age_months / 6) * 100} color={colors.mint} warnBelow={0} />
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>
          {t('asiUntil')} {formatDate(a.until, lang)}
        </Text>
        <Source label={t('asiSource')} year={2020} />
      </Card>
    </Screen>
  );
}
