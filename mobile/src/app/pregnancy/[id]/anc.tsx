import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, ListRow, Loading, MoreLink, Row, Screen, Section, StatusPill } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { saveOrQueue } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import { useAuth } from '../../../lib/auth';
import { localDate } from '../../../lib/dates';
import { formatDate } from '../../../lib/fun';
import { ANC_PLACES, label, VISIT_STATUS } from '../../../lib/pregnancy';
import type { AncVisit, FacilityLink, Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor } from '../../../theme';

/** Periksa hamil: the six visits (1 in TM1, 2 in TM2, 3 in TM3), each with its window and one action. */
export default function AncTracker() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, user } = useAuth();
  const q = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  const link = useApi<FacilityLink>(`/api/pregnancies/${id}/link`);
  const sync = useSync();
  const [place, setPlace] = useState('puskesmas');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = q.data;
  if (!p) return <Screen>{q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;
  // Visits whose results came from the Puskesmas: recorded by the facility, so not undone here.
  const fromFacility = new Set((link.data?.exams ?? []).map((e) => e.visit_number));

  const mark = async (v: AncVisit) => {
    setBusy(v.number);
    setError(null);
    try {
      const visit_date = localDate();
      const r = await saveOrQueue<Pregnancy>('anc', p.id, p.mother_name, `/api/pregnancies/${id}/anc`, { number: v.number, place, visit_date });
      if (r) q.setData(r);
      else {
        const anc = p.anc.map((x) => (x.number === v.number ? { ...x, status: 'done' as const, visit_date, place } : x));
        q.setData({ ...p, anc, anc_done: p.anc_done + 1 });
        await sync.refresh();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const undo = async (v: AncVisit) => {
    try {
      q.setData(await api<Pregnancy>(`/api/pregnancies/${id}/anc/${v.number}`, { method: 'DELETE' }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const nxt = p.next_anc;
  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      {/* The reminder */}
      {nxt ? (
        <Bubble mood={nxt.status === 'overdue' ? 'caring' : 'cheer'} audio={`${t('nextVisit')}: K${nxt.number}. ${VISIT_STATUS[nxt.status].label[lang]}. ${t('ancAudio')}`}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>
            {t('nextVisit')}: K{nxt.number}
          </Text>
          <Text style={{ color: colors.muted }}>
            {nxt.status === 'upcoming' ? `${t('fromWeek')} ${nxt.from_week} · ${formatDate(nxt.window_start, lang)}` : VISIT_STATUS[nxt.status].label[lang]}
            {nxt.doctor ? ` · ${t('withDoctor')}` : ''}
          </Text>
        </Bubble>
      ) : (
        <Bubble mood="cheer">{`${p.anc_done} ${t('ofSix')} ✓`}</Bubble>
      )}

      {user?.id === p.mother_id && link.data && !link.data.enabled && (
        <Card>
          <ListRow emoji="🏥" title={t('flAncInvite')} onPress={() => router.push(`/pregnancy/${id}`)} />
        </Card>
      )}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>📍 {t('placeLbl')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {ANC_PLACES.map((pl) => (
            <Chip key={pl.key} label={pl.label[lang]} selected={place === pl.key} onPress={() => setPlace(pl.key)} />
          ))}
        </View>
      </Card>
      {error && <ErrorBox message={error} />}

      {[1, 2, 3].map((tm) => (
        <View key={tm}>
          <Section title={`Trimester ${tm}`} right={<Text style={{ color: colors.muted, fontSize: 13 }}>{tm === 1 ? '≤ 12' : tm === 2 ? '13–24' : '25–40'} {t('weeksWord')}</Text>} />
          <Card>
            {p.anc
              .filter((v) => v.trimester === tm)
              .map((v, i) => {
                const st = VISIT_STATUS[v.status];
                const c = statusColor[st.key];
                const done = v.status === 'done';
                const fac = done && fromFacility.has(v.number);
                return (
                  <View key={v.number} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                    <Row style={{ gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.mint : c.bg }}>
                        <Text style={{ fontWeight: '800', color: done ? '#fff' : c.fg }}>K{v.number}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontWeight: '700' }}>
                          {formatDate(done && v.visit_date ? v.visit_date : v.target_date, lang)}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                          {fac ? `${v.place} · ${t('flAutoVisit')}` : done && v.place ? label(ANC_PLACES, v.place, lang) : `${t('aroundWeek')} ${v.target_week}`}
                          {v.doctor ? ` · 👩‍⚕️ ${t('withDoctor')}` : ''}
                        </Text>
                      </View>
                      <StatusPill status={st.key} label={st.label[lang]} />
                    </Row>
                    {!done && v.status !== 'upcoming' && <Button small title={t('markDone')} icon="checkmark" loading={busy === v.number} onPress={() => mark(v)} />}
                    {fac && <MoreLink label={t('flSeeNew')} onPress={() => router.push(`/pregnancy/${id}/puskesmas`)} />}
                    {done && !fac && (
                      <Pressable onPress={() => undo(v)} accessibilityRole="button" style={{ alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center' }}>
                        <Text style={{ color: colors.muted, fontSize: 13 }}>{t('undoLbl')}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
          </Card>
        </View>
      ))}
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{t('ancSource')}</Text>
    </Screen>
  );
}
