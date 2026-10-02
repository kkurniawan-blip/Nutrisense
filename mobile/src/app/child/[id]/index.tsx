import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import { AssessmentView, fmtZ } from '../../../components/AssessmentView';
import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { Escalation } from '../../../components/SymptomTiles';
import { SyncBanner } from '../../../components/SyncBanner';
import { Text } from '../../../components/Text';
import {
  Button,
  Card,
  ErrorBox,
  H2,
  IconChip,
  ListRow,
  Loading,
  MoreLink,
  P,
  QuickAction,
  Row,
  Screen,
  Section,
  Segmented,
  SourceTag,
  StatusMark,
  StatusPill,
} from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { isStaff, useAuth } from '../../../lib/auth';
import { childEmoji, formatAge, formatDate, stickers } from '../../../lib/fun';
import { clinicalStatus, motherStatus, txt, zWords } from '../../../lib/status';
import { VISIT_STATUS } from '../../../lib/pregnancy';
import type { Child, Development, KiaSchedule, Meal, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor, tones } from '../../../theme';
import { Icon } from '../../../components/Icon';

type Indicator = 'hfa' | 'wfa' | 'wfh';

const METRIC = {
  height: { tone: tones.blue, icon: 'resize' },
  weight: { tone: tones.orange, icon: 'scale' },
  balance: { tone: tones.green, icon: 'body' },
} as const;

/**
 * One growth indicator as a small pastel tile. Staff see the number (SD) with words underneath; mothers see
 * the words as the main line and the measured value, since an SD means nothing to most caregivers.
 */
function MetricTile({ label, full, z, kind, plain, value }: { label: string; full: string; z: number | null; kind: 'height' | 'weight' | 'balance'; plain?: boolean; value?: string }) {
  const { lang } = useAuth();
  const w = zWords(z, lang, kind);
  const c = statusColor[w.key];
  const m = METRIC[kind];
  return (
    <View accessible accessibilityLabel={`${full}: ${fmtZ(z)} SD, ${w.text}`} style={{ flex: plain ? undefined : 1, backgroundColor: m.tone.bg, borderRadius: 18, padding: 12, gap: 4 }}>
      <Row style={{ gap: 5 }}>
        <Icon name={m.icon} size={14} color={m.tone.fg} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: m.tone.fg }}>{label}</Text>
      </Row>
      {plain ? (
        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
          <StatusMark status={w.key} size={8} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '800', color: c.fg }}>{w.text}</Text>
          {value ? <Text style={{ fontSize: 14, color: colors.muted }}>{value}</Text> : null}
        </Row>
      ) : (
        <>
          <Text style={{ fontSize: 20, fontWeight: '900', color: c.fg }}>
            {fmtZ(z)} <Text style={{ fontSize: 12, fontWeight: '600' }}>SD</Text>
          </Text>
          <Row style={{ gap: 5, alignItems: 'flex-start' }}>
            <View style={{ marginTop: 5 }}>
              <StatusMark status={w.key} size={7} />
            </View>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: c.fg }}>{w.text}</Text>
          </Row>
        </>
      )}
    </View>
  );
}

function GrowthTrend({ childId, name }: { childId: string; name: string }) {
  const { t } = useAuth();
  const [ind, setInd] = useState<Indicator>('hfa');
  const [more, setMore] = useState(false);
  const chart = useApi<ChartData>(`/api/children/${childId}/growth-chart?indicator=${ind}`);
  const d = chart.data;
  return (
    <Card>
      <H2 right={<MoreLink label={t('seeAll')} onPress={() => router.push(`/child/${childId}/history`)} />}>{t('growthTrend')}</H2>
      <Segmented<Indicator>
        value={ind}
        onChange={setInd}
        options={[
          { value: 'hfa', label: t('height_short') },
          { value: 'wfa', label: t('weight_short') },
          { value: 'wfh', label: t('bbtb_short') },
        ]}
      />
      {!d && (chart.error ? <Text style={{ color: colors.muted, fontSize: 14, marginVertical: 12 }}>📶 {t('chartNeedsSignal')}</Text> : <Loading />)}
      {d && d.points.length > 0 && (
        <GrowthChart
          data={d}
          labels={{
            child: name,
            average: t('average'),
            lowerLimit: t('lowerLimit'),
            farBelow: t('farBelow'),
            projection: t('projectionLbl'),
            xAxis: d.x_unit === 'cm' ? t('axisHeight') : t('axisAge'),
          }}
        />
      )}
      <MoreLink label={t('learnChart')} open={more} onPress={() => setMore(!more)} />
      {more && (
        <View style={{ gap: 4 }}>
          {d?.meaning ? <Text style={{ fontSize: 14, lineHeight: 20 }}>{d.meaning}</Text> : null}
          {d?.details && (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {d.details.label}: {fmtZ(d.details.z)} SD · {d.details.reference}
            </Text>
          )}
          <Text style={{ color: colors.muted, fontSize: 13 }}>{t('zExplain')}</Text>
        </View>
      )}
    </Card>
  );
}

/** Buku KIA at a glance: the next vaccine / vitamin A / deworming, and the way to the full schedule. */
function KiaSummary({ childId }: { childId: string }) {
  const { t, lang } = useAuth();
  const kia = useApi<KiaSchedule>(`/api/children/${childId}/kia`);
  const s = kia.data;
  if (!s) return null;
  const n = s.next;
  const done = s.immunization.filter((r) => r.status === 'done').length;
  const title = n ? (n.vaccines ? n.vaccines.join(' · ') : n.key.startsWith('vita') ? t('vitA') : t('deworm')) : t('kiaComplete');
  const st = n ? VISIT_STATUS[n.status] : null;
  return (
    <Card onPress={() => router.push(`/child/${childId}/kia`)}>
      <H2 emoji="💉" right={<Icon name="chevron-forward" size={18} color={colors.muted} />}>
        {t('kiaTitle')}
      </H2>
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {t('immunization')} {done}/{s.immunization.length}
            {n?.status === 'upcoming' ? ` · ${formatDate(n.target_date, lang)}` : ''}
          </Text>
        </View>
        {st && <StatusPill status={st.key} label={st.label[lang]} />}
      </Row>
    </Card>
  );
}

const DEV_ICON = { on_track: '✓', monitor: '●', unknown: '○' } as const;

/** Development at a glance: each area with an icon and a tick or a dot, nothing more. */
function DevelopmentSummary({ childId }: { childId: string }) {
  const { t } = useAuth();
  const dev = useApi<Development>(`/api/children/${childId}/development`);
  if (!dev.data || dev.data.band_months === null) return null;
  const map = { on_track: 'ok', monitor: 'monitor', unknown: 'unknown' } as const;
  return (
    <Card onPress={() => router.push(`/child/${childId}/development`)}>
      <H2 right={<Icon name="chevron-forward" size={18} color={colors.muted} />}>{t('development')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {dev.data.domains.map((d) => {
          const c = statusColor[map[d.status]];
          return (
            <View
              key={d.key}
              accessible
              accessibilityLabel={`${d.label}: ${t(`dev_${d.status}`)}`}
              style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: c.bg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 20 }}>{d.emoji}</Text>
              <Text style={{ flex: 1, fontWeight: '600', fontSize: 14 }}>{d.label}</Text>
              <Text style={{ fontWeight: '900', color: c.mark, fontSize: 16 }}>{DEV_ICON[d.status]}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, t, lang } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const measurements = useApi<Measurement[]>(`/api/children/${id}/measurements`);
  const meals = useApi<Meal[]>(`/api/children/${id}/meals?limit=100`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const c = child.data;
  const mom = user?.role === 'caregiver';

  const reload = () => [child, measurements, meals].forEach((x) => void x.reload());

  const exportFhir = async () => {
    try {
      const b = await api<{ entry: { resource: { resourceType: string } }[] }>(`/api/children/${id}/fhir`);
      const counts: Record<string, number> = {};
      b.entry.forEach((e) => (counts[e.resource.resourceType] = (counts[e.resource.resourceType] ?? 0) + 1));
      // Mothers get a plain count; staff also see the FHIR resource types they will import.
      const n = Object.values(counts).reduce((x, y) => x + y, 0);
      setMsg(`${t('fhirReady').replace('{n}', String(n))}${isStaff(user) ? ` (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const syncSatusehat = async () => {
    try {
      const r = await api<{ status: string; resources: number }>(`/api/children/${id}/fhir/sync`, { method: 'POST' });
      setMsg(`SATUSEHAT: ${r.status} (${r.resources})`);
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const doDelete = async () => {
    setBusy(true);
    try {
      await api(`/api/children/${id}`, { method: 'DELETE' });
      router.back();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(t('deleteConfirm'))) void doDelete();
      return;
    }
    Alert.alert(t('deleteChild'), t('deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteChild'), style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  if (!c) return <Screen>{child.error ? <ErrorBox message={child.error} onRetry={child.reload} /> : <Loading />}</Screen>;

  const a = c.latest_assessment;
  const m = c.latest_measurement;
  const name = c.name.split(' ')[0];
  const st = motherStatus(a);
  const girl = c.sex === 'female';
  const kader = c.care_team?.find((x) => x.role === 'kader');
  const emergency = a?.triage.urgency === 'emergency';

  return (
    <Screen refreshing={child.loading} onRefresh={reload}>
      <Stack.Screen options={{ title: c.name }} />
      <SyncBanner stale={child.stale || measurements.stale || meals.stale} />

      {/* Who and how they are */}
      <Row style={{ gap: 14, marginBottom: 18 }}>
        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: girl ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 36 }}>{childEmoji(c.sex, c.age_months)}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 21, fontWeight: '900' }}>{c.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {formatAge(c.age_months, lang)}
            {c.region?.name ? ` · 📍 ${c.region.name}` : ''}
          </Text>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {mom ? <StatusPill status={st.key} label={txt(st.label, lang)} /> : <StatusPill status={clinicalStatus(a?.risk_level)} label={a ? t(`risk_${a.risk_level}`) : t('notAssessed')} />}
            {c.weight_gain?.two_t ? <StatusPill status="action" label={t('twoTBadge')} /> : null}
          </Row>
        </View>
      </Row>

      {/* When the child needs help now, getting help comes before anything else. */}
      {emergency && <Escalation phone={kader?.phone} facility={c.facility} />}

      {/* The three growth numbers */}
      {m ? (
        <View style={{ flexDirection: mom ? 'column' : 'row', gap: 8, alignItems: 'stretch' }}>
          <MetricTile label={t('height_short')} full={t('fHeightAge')} z={m.haz} kind="height" plain={mom} value={`${m.height_cm} cm`} />
          <MetricTile label={t('weight_short')} full={t('fWeightAge')} z={m.waz} kind="weight" plain={mom} value={`${m.weight_kg} kg`} />
          <MetricTile label={mom ? t('balancePlain') : t('bbtb_short')} full={t('fWeightHeight')} z={m.whz} kind="balance" plain={mom} />
        </View>
      ) : (
        <P muted>{t('noMeasurementYet')}</P>
      )}
      <View style={{ marginTop: 10, marginBottom: 10 }}>
        <Button title={t('tileMeasure')} icon="add-circle" variant={emergency ? 'secondary' : undefined} onPress={() => router.push(`/child/${id}/measure`)} />
      </View>

      {m && <GrowthTrend childId={id} name={name} />}

      {/* Nuri's short guidance and what to do */}
      {a && <AssessmentView a={a} facility={c.facility} kaderPhone={kader?.phone} hideEmergency={emergency} />}

      <KiaSummary childId={id} />
      {c.posyandu && (
        <Card>
          <Row style={{ gap: 12 }}>
            <IconChip emoji="📅" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{t('nextPosyandu')}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {formatDate(c.posyandu.date, lang)} · {c.posyandu.place}
              </Text>
            </View>
            <StatusPill status="info" label={c.posyandu.days === 0 ? t('todayLbl') : `${c.posyandu.days} ${t('daysLeft')}`} />
          </Row>
        </Card>
      )}

      <DevelopmentSummary childId={id} />

      {/* Food shortcuts: ASI only before 6 months */}
      <Card>
        {c.age_months < 6 ? (
          <Row style={{ alignItems: 'flex-start', gap: 4 }}>
            <QuickAction emoji="🤱" tone="pink" label={t('asiTitle')} onPress={() => router.push(`/child/${id}/asi`)} />
            <QuickAction emoji="💉" tone="blue" label={t('kiaTitle')} onPress={() => router.push(`/child/${id}/kia`)} />
            <QuickAction emoji="📈" tone="green" label={t('growthHistory')} onPress={() => router.push(`/child/${id}/history`)} />
          </Row>
        ) : (
          <Row style={{ alignItems: 'flex-start', gap: 4 }}>
            <QuickAction emoji="📸" tone="orange" label="NutriScan" onPress={() => router.push(`/nutriscan?child=${id}`)} />
            <QuickAction emoji="✍️" tone="green" label={t('actLogMeal')} onPress={() => router.push(`/child/${id}/meal?action=manual`)} />
            <QuickAction emoji="🗓️" tone="blue" label={t('nutritionPlan')} onPress={() => router.push(`/child/${id}/nutrition`)} />
            <QuickAction emoji="👩‍🍳" tone="pink" label={t('recipes')} onPress={() => router.push(`/child/${id}/recipes`)} />
          </Row>
        )}
      </Card>

      {mom && (
        <Card>
          <H2>{t('stickersTitle')}</H2>
          <Row style={{ justifyContent: 'space-between' }}>
            {stickers(meals.data ?? [], measurements.data ?? [], lang).map((s) => (
              <View key={s.key} accessible accessibilityLabel={`${s.title}: ${s.earned ? t('earned') : t('notYet')}`} style={{ alignItems: 'center', flex: 1 }}>
                <View style={{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: s.earned ? colors.accentSoft : colors.line, borderWidth: 2, borderColor: s.earned ? colors.accent : '#D5D0EA', borderStyle: s.earned ? 'solid' : 'dashed' }}>
                  <Text style={{ fontSize: 24, opacity: s.earned ? 1 : 0.4 }}>{s.emoji}</Text>
                </View>
                <Text style={{ fontSize: 11.5, textAlign: 'center', marginTop: 4, color: s.earned ? colors.text : colors.muted }}>{s.title}</Text>
              </View>
            ))}
          </Row>
        </Card>
      )}

      {/* Care team: avatar, name, role, status */}
      <Section title={`${t('teamOf')} ${name}`} />
      <Card>
        {c.care_team?.map((mbr, i) => (
          <Row key={mbr.role} style={{ paddingVertical: 8, gap: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: tones.lavender.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>{mbr.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700' }}>{mbr.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {mbr.label}
                {mbr.role === 'facility' && c.facility?.distance_km ? ` · ± ${c.facility.distance_km} km` : ''}
              </Text>
              <Row style={{ gap: 5 }}>
                <StatusMark status="ok" size={7} />
                <Text style={{ fontSize: 12, color: statusColor.ok.fg }}>{t('active')}</Text>
              </Row>
            </View>
            {mbr.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${mbr.phone}`)} accessibilityRole="button" accessibilityLabel={`${t('call')} ${mbr.name}`} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="call" size={20} color={colors.ok} />
              </Pressable>
            ) : null}
          </Row>
        ))}
        {c.last_reviewed && (
          <Text style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>
            {t('lastReviewed')}: {formatDate(c.last_reviewed.at, lang)}
          </Text>
        )}
      </Card>
      {(c.professional_recommendations ?? []).slice(0, 3).map((r) => (
        <Card key={r.at + r.author} tint={statusColor.info.bg}>
          <SourceTag kind="pro" />
          <Text style={{ fontWeight: '700', color: statusColor.info.fg, fontSize: 14 }}>
            {r.author} · {formatDate(r.at, lang)}
          </Text>
          {r.text ? <P style={{ marginTop: 4 }}>{r.text}</P> : <P muted>{t('reviewConfirmed')}</P>}
        </Card>
      ))}
      {!c.professional_recommendations?.length && kader && (
        <P muted style={{ marginBottom: 12, fontSize: 13 }}>
          {t('askKader')} {kader.name}.
        </P>
      )}

      {/* Data and account actions: out of the way */}
      <MoreLink label={t('dataPrivacy')} open={more} onPress={() => setMore(!more)} />
      {more && (
        <Card>
          <ListRow emoji="📄" title={t('exportData')} onPress={exportFhir} />
          {isStaff(user) && <ListRow emoji="☁️" title={t('satusehatSync')} onPress={syncSatusehat} />}
          {mom && <ListRow emoji="⚙️" title={t('privacySettings')} onPress={() => router.push('/privacy')} />}
          {(mom || user?.role === 'admin') && <Button small variant="danger" title={t('deleteChild')} icon="trash-outline" onPress={confirmDelete} loading={busy} />}
          {msg && <P muted>{msg}</P>}
        </Card>
      )}
    </Screen>
  );
}
