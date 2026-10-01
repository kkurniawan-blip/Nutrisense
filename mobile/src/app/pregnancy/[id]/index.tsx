import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AncDots, NifasList, RiskCard } from '../../../components/PregnancyParts';
import { Text } from '../../../components/Text';
import { Bar, Button, Card, ErrorBox, H2, Loading, QuickAction, Row, Screen, Section, StatusMark, StatusPill } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import { BIRTH_HELPERS, BIRTH_PLACES, BIRTH_ATTENDANTS, BIRTH_PLACES_DONE, FUNDING, label, motherState, TRANSPORT, VISIT_STATUS, weeksText, FLAG_LABEL } from '../../../lib/pregnancy';
import type { Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor, StatusKey, tones } from '../../../theme';

/** A mother's number as a small pastel tile, like the child's growth tiles. */
function MomTile({ label: title, value, unit, status, word, tone, icon }: { label: string; value: string; unit: string; status: StatusKey; word: string; tone: keyof typeof tones; icon: keyof typeof Ionicons.glyphMap }) {
  const c = statusColor[status];
  const t = tones[tone];
  return (
    <View accessible accessibilityLabel={`${title}: ${value} ${unit}, ${word}`} style={{ flex: 1, backgroundColor: t.bg, borderRadius: 18, padding: 12, gap: 4 }}>
      <Row style={{ gap: 5 }}>
        <Ionicons name={icon} size={14} color={t.fg} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.fg }}>{title}</Text>
      </Row>
      <Text style={{ fontSize: 20, fontWeight: '900', color: status === 'unknown' ? colors.muted : c.fg }}>
        {value} <Text style={{ fontSize: 12, fontWeight: '600' }}>{unit}</Text>
      </Text>
      <Row style={{ gap: 5, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 5 }}>
          <StatusMark status={status} size={7} />
        </View>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: 11.5, lineHeight: 15, color: c.fg }}>
          {word}
        </Text>
      </Row>
    </View>
  );
}

export default function PregnancyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const q = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  const p = q.data;
  if (!p) return <Screen>{q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;

  const st = motherState(p);
  const flag = (code: string) => p.flags.find((f) => f.code === code);
  const kek = flag('kek');
  const anemia = flag('severe_anemia') ?? flag('anemia');
  const short = flag('short_stature');
  const nxt = p.next_anc;
  const delivered = p.status === 'delivered';
  const plan = p.birth_plan ?? {};

  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <Stack.Screen options={{ title: t('pregnancy') }} />

      {/* Who and how she is */}
      <Row style={{ gap: 14, marginBottom: 18 }}>
        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 36 }}>🤰</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 21, fontWeight: '900' }}>{p.mother_name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {delivered ? t('nifasPeriod') : `Trimester ${p.trimester}`}
            {p.gravida ? ` · ${t('pregnancyNo')}${p.gravida}` : ''}
          </Text>
          <StatusPill status={st.key} label={st.text} />
          {st.reasons && !delivered ? <Text style={{ color: statusColor[st.key].fg, fontSize: 13, fontWeight: '600' }}>{st.reasons}</Text> : null}
        </View>
      </Row>
      <RiskCard p={p} />

      {delivered ? (
        <Card>
          {p.birth_info?.place || p.birth_info?.attendant ? (
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>
              {[label(BIRTH_PLACES_DONE, p.birth_info.place, lang), label(BIRTH_ATTENDANTS, p.birth_info.attendant, lang), p.birth_info.gestational_weeks ? `${p.birth_info.gestational_weeks} ${t('weeksWord')}` : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <H2>{t('nifasTitle')}</H2>
          {p.nifas && <NifasList nifas={p.nifas} />}
          {p.child_id && <Button title={t('openChild')} icon="arrow-forward" onPress={() => router.push(`/child/${p.child_id}`)} />}
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{t('pregnancyAge')}</Text>
          <Text style={{ fontSize: 24, fontWeight: '900', marginBottom: 10 }}>{weeksText(p.gestational_weeks, p.gestational_extra_days, lang)}</Text>
          <Bar pct={(p.gestational_days / 280) * 100} color={colors.primary} warnBelow={0} />
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>
            {t('hplLabel')} {formatDate(p.hpl, lang)} · {Math.max(0, p.days_to_hpl)} {t('daysLeft')}
          </Text>
        </Card>
      )}

      {/* LiLA, Hb, height */}
      <Row style={{ gap: 8, alignItems: 'stretch' }}>
        <MomTile
          label={t('muacShort')}
          value={p.latest.muac_cm?.toFixed(1) ?? '–'}
          unit="cm"
          status={p.latest.muac_cm == null ? 'unknown' : kek ? 'action' : 'ok'}
          word={p.latest.muac_cm == null ? t('notMeasured') : kek ? FLAG_LABEL.kek[lang] : 'Normal'}
          tone="orange"
          icon="body"
        />
        <MomTile
          label={t('hbShort')}
          value={p.latest.hb_g_dl?.toFixed(1) ?? '–'}
          unit="g/dL"
          status={p.latest.hb_g_dl == null ? 'unknown' : anemia ? anemia.status : 'ok'}
          word={p.latest.hb_g_dl == null ? t('notMeasured') : anemia ? FLAG_LABEL[anemia.code][lang] : 'Normal'}
          tone="pink"
          icon="water"
        />
        <MomTile
          label={t('motherHeight')}
          value={p.mother_height_cm ? String(Math.round(p.mother_height_cm)) : '–'}
          unit="cm"
          status={p.mother_height_cm == null ? 'unknown' : short ? 'monitor' : 'ok'}
          word={p.mother_height_cm == null ? t('notMeasured') : short ? '< 145 cm' : 'Normal'}
          tone="blue"
          icon="resize"
        />
      </Row>
      {!delivered && (
        <View style={{ marginTop: 10, marginBottom: 10 }}>
          <Button title={t('motherCheck')} icon="add-circle" onPress={() => router.push(`/pregnancy/${id}/measure`)} />
        </View>
      )}

      {/* Antenatal visits */}
      {!delivered && (
        <Card onPress={() => router.push(`/pregnancy/${id}/anc`)}>
          <H2 right={<Text style={{ fontSize: 15, fontWeight: '800' }}>{`${p.anc_done} ${t('ofSix')}`}</Text>}>{t('ancTitle')}</H2>
          <AncDots anc={p.anc} />
          {nxt && (
            <Text style={{ marginTop: 12, fontSize: 14 }}>
              <Text style={{ fontWeight: '700' }}>
                {t('nextVisit')}: K{nxt.number}
              </Text>
              <Text style={{ color: colors.muted }}>
                {' · '}
                {nxt.status === 'upcoming' ? `${t('fromWeek')} ${nxt.from_week}` : VISIT_STATUS[nxt.status].label[lang]}
              </Text>
            </Text>
          )}
        </Card>
      )}

      {/* TTD & PMT */}
      {!delivered && (
        <Card onPress={() => router.push(`/pregnancy/${id}/supplements`)}>
          <H2 right={<Ionicons name="chevron-forward" size={18} color="#A09CB5" />}>{t('ttdPmt')}</H2>
          <Row style={{ justifyContent: 'space-between' }}>
            {p.daily_week.map((d) => (
              <View key={d.day} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: d.ttd ? colors.mint : colors.line }}>
                  {d.ttd ? <Ionicons name="checkmark" size={17} color="#fff" /> : null}
                </View>
                <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(`${d.day}T00:00:00`).getDate()}</Text>
              </View>
            ))}
          </Row>
          <Text style={{ marginTop: 10, fontSize: 14 }}>
            <Text style={{ fontWeight: '700' }}>
              {t('ttdTaken')}: {p.ttd_total}
            </Text>
            <Text style={{ color: colors.muted }}> · {t('ttdTarget')}</Text>
          </Text>
        </Card>
      )}

      {/* Shortcuts */}
      <Card>
        <Row style={{ alignItems: 'flex-start', gap: 4 }}>
          <QuickAction emoji="🚨" tone="pink" label={t('urgentSigns')} onPress={() => router.push(`/pregnancy/${id}/danger`)} />
          <QuickAction emoji="🏥" tone="orange" label={t('birthPlan')} onPress={() => router.push(`/pregnancy/${id}/plan`)} />
          {!delivered && p.gestational_weeks >= 20 && (
            <QuickAction emoji="👶" tone="green" label={t('recordBirth')} onPress={() => router.push(`/pregnancy/${id}/birth`)} />
          )}
          <QuickAction emoji="💬" tone="lavender" label={t('tileConsult')} onPress={() => router.push('/assistant')} />
        </Row>
      </Card>

      {/* Birth plan, one line each */}
      {!delivered && (
        <Card onPress={() => router.push(`/pregnancy/${id}/plan`)}>
          <H2 right={<Ionicons name="chevron-forward" size={18} color="#A09CB5" />}>{t('birthPlan')}</H2>
          {[
            { emoji: '🏥', title: t('birthPlace'), value: plan.place ? label(BIRTH_PLACES, plan.place, lang) : null },
            { emoji: '🚑', title: t('transportLbl'), value: plan.transport ? label(TRANSPORT, plan.transport, lang) : null },
            { emoji: '🤝', title: t('companionLbl'), value: plan.companion ?? null },
            { emoji: '👩‍⚕️', title: t('helperLbl'), value: plan.helper ? label(BIRTH_HELPERS, plan.helper, lang) : null },
            { emoji: '🩸', title: t('donorLbl'), value: plan.blood_donor ?? null },
            { emoji: '💳', title: t('fundingLbl'), value: plan.funding ? label(FUNDING, plan.funding, lang) : null },
          ].map((r) => (
            <Row key={r.title} style={{ paddingVertical: 6, gap: 10 }}>
              <Text style={{ fontSize: 18 }}>{r.emoji}</Text>
              <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }}>{r.title}</Text>
              <Text style={{ fontSize: 14, fontWeight: r.value ? '700' : '400', color: r.value ? colors.text : colors.warn }}>{r.value ?? t('notFilled')}</Text>
            </Row>
          ))}
        </Card>
      )}

      {/* Care team */}
      <Section title={`${t('teamOf')} ${t('momPill')}`} />
      <Card>
        {p.care_team.map((mbr, i) => (
          <Row key={mbr.role} style={{ paddingVertical: 8, gap: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: tones.lavender.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>{mbr.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700' }}>{mbr.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {mbr.label}
                {mbr.role === 'facility' && p.facility?.distance_km ? ` · ± ${p.facility.distance_km} km` : ''}
              </Text>
            </View>
            {mbr.phone && mbr.role !== 'mother' ? (
              <Pressable onPress={() => Linking.openURL(`tel:${mbr.phone}`)} accessibilityLabel={`${t('call')} ${mbr.name}`} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="call" size={20} color={colors.ok} />
              </Pressable>
            ) : null}
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
