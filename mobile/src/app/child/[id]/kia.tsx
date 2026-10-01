import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import { Text } from '../../../components/Text';
import { Bubble, Button, Card, ErrorBox, Loading, MoreLink, Row, Screen, Section, Source, StatusPill } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import { saveOrQueue } from '../../../lib/offline';
import { VISIT_STATUS } from '../../../lib/pregnancy';
import { useSync } from '../../../lib/sync';
import type { Child, KiaItem, KiaSchedule } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor, tones } from '../../../theme';

const ageLabel = (m: number, lang: 'id' | 'en') => (m === 0 ? (lang === 'id' ? 'Lahir' : 'Birth') : `${m} ${lang === 'id' ? 'bln' : 'mo'}`);

/** Jadwal KIA: imunisasi by age, vitamin A (Feb & Aug) and obat cacing, each with its status and one action. */
export default function KiaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const sync = useSync();
  const child = useApi<Child>(`/api/children/${id}`);
  const q = useApi<KiaSchedule>(`/api/children/${id}/kia`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allVitA, setAllVitA] = useState(false);
  const s = q.data;
  if (!s || !child.data) return <Screen>{q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;
  const name = child.data.name.split(' ')[0];

  const title = (r: KiaItem) =>
    r.vaccines ? r.vaccines.join(' · ') : r.key.startsWith('vita') ? `${t('vitA')} (${r.dose === 'biru' ? t('capsuleBlue') : t('capsuleRed')})` : t('deworm');

  const mark = async (r: KiaItem) => {
    setBusy(r.key);
    setError(null);
    try {
      const body = { item_key: r.key, given_at: new Date().toISOString().slice(0, 10) };
      const res = await saveOrQueue<KiaSchedule>('kia', Number(id), child.data!.name, `/api/children/${id}/kia`, body);
      if (res) q.setData(res);
      else {
        // Offline: show it as done now; it is sent when the signal returns.
        const done = (x: KiaItem) => (x.key === r.key ? { ...x, status: 'done' as const, given_at: body.given_at } : x);
        q.setData({ ...s, immunization: s.immunization.map(done), vitamin_a: s.vitamin_a.map(done), deworming: s.deworming.map(done) });
        await sync.refresh();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  // Undo removes a record, so ask first: one stray tap must not delete a vaccine.
  const confirmUndo = (r: KiaItem) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${t('undoConfirm')} ${title(r)}?`)) void undo(r);
      return;
    }
    Alert.alert(t('undoLbl'), `${t('undoConfirm')} ${title(r)}?`, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('undoLbl'), style: 'destructive', onPress: () => void undo(r) },
    ]);
  };
  const kader = child.data.care_team?.find((m) => m.role === 'kader');
  const posyandu = child.data.posyandu;
  // Missed first (with what to do next), then due now, then later, then done.
  const ORDER = { overdue: 0, due: 1, upcoming: 2, done: 3 } as const;
  const byStatus = (items: KiaItem[]) => [...items].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.age - b.age);
  const undo = async (r: KiaItem) => {
    try {
      q.setData(await api<KiaSchedule>(`/api/children/${id}/kia/${r.key}`, { method: 'DELETE' }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const rows = (items: KiaItem[]) =>
    items.map((r, i) => {
      const st = VISIT_STATUS[r.status];
      const c = statusColor[st.key];
      const done = r.status === 'done';
      return (
        <View key={r.key} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
          <Row style={{ gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.mint : c.bg }}>
              <Text style={{ fontWeight: '800', fontSize: 12.5, color: done ? '#fff' : c.fg }}>{ageLabel(r.age, lang)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700' }}>{title(r)}</Text>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {done && r.given_at ? `${t('givenOn')} ${formatDate(r.given_at, lang)}` : `${t('aroundDate')} ${formatDate(r.target_date, lang)}`}
              </Text>
            </View>
            <StatusPill status={st.key} label={st.label[lang]} />
          </Row>
          {r.status === 'overdue' && (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ fontSize: 14, color: statusColor.urgent.fg, fontWeight: '700' }}>
                {posyandu ? `${t('bringToPosyandu')} ${formatDate(posyandu.date, lang)}` : t('catchUpVaccine')}
              </Text>
              {kader?.phone ? <Button small variant="secondary" icon="call" title={t('actDiscuss')} onPress={() => Linking.openURL(`tel:${kader.phone}`)} /> : null}
            </View>
          )}
          {!done && r.status !== 'upcoming' && <Button small variant="ghost" title={t('markDone')} icon="checkmark" loading={busy === r.key} onPress={() => void mark(r)} />}
          {done && (
            <Pressable onPress={() => confirmUndo(r)} accessibilityRole="button" style={{ alignSelf: 'flex-end', minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{t('undoLbl')}</Text>
            </Pressable>
          )}
        </View>
      );
    });

  // Vitamin A and deworming repeat every 6 months: show what counts now (the last missed, the current and the next).
  const around = (items: KiaItem[]) => {
    const idx = items.findIndex((r) => r.status === 'due' || r.status === 'upcoming');
    const from = Math.max(0, (idx === -1 ? items.length : idx) - 1);
    return items.slice(from, from + 2);
  };
  const doneCount = (items: KiaItem[]) => `${items.filter((r) => r.status === 'done').length}/${items.filter((r) => r.status !== 'upcoming').length}`;
  const nxt = s.next;

  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      {nxt ? (
        <Bubble mood={nxt.status === 'overdue' ? 'caring' : 'cheer'} audio={`${t('nextKia')}: ${title(nxt)}. ${VISIT_STATUS[nxt.status].label[lang]}.`}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>{title(nxt)}</Text>
          <Text style={{ color: colors.muted }}>
            {t('nextKia')} · {nxt.status === 'upcoming' ? formatDate(nxt.target_date, lang) : VISIT_STATUS[nxt.status].label[lang]}
          </Text>
        </Bubble>
      ) : (
        <Bubble mood="cheer">{`${name}: ${t('kiaComplete')} ✓`}</Bubble>
      )}
      {error && <ErrorBox message={error} />}

      <Section title={`💉 ${t('immunization')}`} right={<Text style={{ color: colors.muted, fontSize: 13 }}>{doneCount(s.immunization)}</Text>} />
      <Card>{rows(byStatus(s.immunization))}</Card>

      <Section title={`🅰️ ${t('vitA')}`} right={<Text style={{ color: colors.muted, fontSize: 13 }}>{doneCount(s.vitamin_a)}</Text>} />
      <Card tint={tones.yellow.bg}>
        {rows(allVitA ? s.vitamin_a : around(s.vitamin_a))}
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>🗓️ {t('vitAMonths')}</Text>
        <MoreLink label={allVitA ? t('showLess') : t('seeAll')} open={allVitA} onPress={() => setAllVitA(!allVitA)} />
      </Card>

      {s.age_months >= 9 && (
        <>
          <Section title={`💊 ${t('deworm')}`} right={<Text style={{ color: colors.muted, fontSize: 13 }}>{doneCount(s.deworming)}</Text>} />
          <Card>{rows(allVitA ? s.deworming : around(s.deworming))}</Card>
        </>
      )}
      <Source label={s.source} />
    </Screen>
  );
}
