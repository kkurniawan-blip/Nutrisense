import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import { AssessmentView, fmtZ } from '../../../components/AssessmentView';
import { DiversityCard } from '../../../components/Diversity';
import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { SyncBanner } from '../../../components/SyncBanner';
import { Text } from '../../../components/Text';
import {
  Button,
  Card,
  ErrorBox,
  H2,
  JourneyHeader,
  ListRow,
  Loading,
  P,
  Row,
  Screen,
  Segmented,
  SourceTag,
  StatusMark,
  StatusPill,
} from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { isStaff, useAuth } from '../../../lib/auth';
import { childEmoji, formatAge, formatDate, stickers } from '../../../lib/fun';
import { clinicalStatus, motherStatus, txt, zWords } from '../../../lib/status';
import type { Child, Development, Meal, Measurement, TodayChecklist } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor, tones } from '../../../theme';

type Indicator = 'hfa' | 'wfa' | 'wfh';

const METRIC = {
  height: { tone: tones.blue, icon: 'resize' },
  weight: { tone: tones.orange, icon: 'scale' },
  balance: { tone: tones.green, icon: 'body' },
} as const;

/** One growth indicator as a small pastel tile: what it is, and how the child is doing in words. */
function MetricTile({ label, full, z, kind, showZ }: { label: string; full: string; z: number | null; kind: 'height' | 'weight' | 'balance'; showZ: boolean }) {
  const { lang } = useAuth();
  const w = zWords(z, lang, kind);
  const c = statusColor[w.key];
  const m = METRIC[kind];
  return (
    <View accessible accessibilityLabel={`${full}: ${w.text}`} style={{ flex: 1, backgroundColor: m.tone.bg, borderRadius: 16, padding: 10, gap: 6 }}>
      <Row style={{ gap: 6 }}>
        <Ionicons name={m.icon} size={15} color={m.tone.fg} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: m.tone.fg }}>{label}</Text>
      </Row>
      {showZ && <Text style={{ fontSize: 20, fontWeight: '900', color: c.fg }}>{fmtZ(z)}</Text>}
      <Row style={{ gap: 5, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 6 }}>
          <StatusMark status={w.key} />
        </View>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: c.fg, lineHeight: 18 }}>{w.text}</Text>
      </Row>
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
      <H2 emoji="📈">{t('growthTrend')}</H2>
      <Segmented<Indicator>
        value={ind}
        onChange={setInd}
        options={[
          { value: 'hfa', label: t('height_short') },
          { value: 'wfa', label: t('weight_short') },
          { value: 'wfh', label: t('bbtb_short') },
        ]}
      />
      {!d && <Loading />}
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
      {d?.meaning && (
        <View style={{ backgroundColor: statusColor.info.bg, borderRadius: 14, padding: 12, marginTop: 10 }}>
          <Text style={{ fontWeight: '900', color: statusColor.info.fg, marginBottom: 4 }}>💡 {t('whatItMeans')}</Text>
          <Text style={{ lineHeight: 22 }}>{d.meaning}</Text>
        </View>
      )}
      {d?.details && (
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>
            {more ? '▲' : '▼'} {t('learnMore')}
          </Text>
        </Pressable>
      )}
      {more && d?.details && (
        <View>
          <Text style={{ fontWeight: '800' }}>{d.details.label}</Text>
          <Text style={{ color: colors.muted }}>
            Z-score: {fmtZ(d.details.z)} · {d.details.class.replace(/_/g, ' ')} · {d.details.reference}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{t('zExplain')}</Text>
        </View>
      )}
    </Card>
  );
}

function DevelopmentSummary({ childId, name }: { childId: string; name: string }) {
  const { t } = useAuth();
  const dev = useApi<Development>(`/api/children/${childId}/development`);
  if (!dev.data || dev.data.band_months === null) return null;
  const map = { on_track: 'ok', monitor: 'monitor', unknown: 'unknown' } as const;
  return (
    <Card onPress={() => router.push(`/child/${childId}/development`)}>
      <H2 emoji="🧠">
        {t('developmentOf')} {name}
      </H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {dev.data.domains.map((d) => {
          const c = statusColor[map[d.status]];
          return (
            <View key={d.key} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: c.bg, borderRadius: 16, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 24 }}>{d.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800' }}>{d.label}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.fg }}>{t(`dev_${d.status}`)}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text style={{ fontWeight: '900', marginTop: 14 }}>🗓️ {t('activitiesThisWeek')}</Text>
      {dev.data.activities.map((a) => (
        <Text key={a.text} style={{ marginTop: 2 }}>
          {a.emoji} {a.text}
        </Text>
      ))}
      <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }}>{t('openChecklist')} →</Text>
    </Card>
  );
}

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, t, lang } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const measurements = useApi<Measurement[]>(`/api/children/${id}/measurements`);
  const meals = useApi<Meal[]>(`/api/children/${id}/meals?limit=100`);
  const today = useApi<TodayChecklist>(`/api/children/${id}/today`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const c = child.data;
  const mom = user?.role === 'caregiver';

  const reload = () => [child, measurements, meals, today].forEach((x) => void x.reload());

  const exportFhir = async () => {
    try {
      const b = await api<{ entry: { resource: { resourceType: string } }[] }>(`/api/children/${id}/fhir`);
      const counts: Record<string, number> = {};
      b.entry.forEach((e) => (counts[e.resource.resourceType] = (counts[e.resource.resourceType] ?? 0) + 1));
      setMsg(`FHIR R4 Bundle: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
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
  const history = [...(measurements.data ?? [])].reverse();
  const kader = c.care_team?.find((x) => x.role === 'kader');

  return (
    <Screen refreshing={child.loading} onRefresh={reload}>
      <Stack.Screen options={{ title: c.name }} />
      <SyncBanner stale={child.stale} />

      {/* Who and how they are */}
      <Card>
        <Row style={{ gap: 14 }}>
          <View style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: girl ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 38 }}>{childEmoji(c.sex, c.age_months)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '900' }}>{c.name}</Text>
            <Text style={{ color: colors.muted, marginBottom: 6 }}>
              {formatAge(c.age_months, lang)} · 📍 {c.region?.name}
            </Text>
            {mom ? <StatusPill status={st.key} label={txt(st.label, lang)} large /> : <StatusPill status={clinicalStatus(a?.risk_level)} label={a ? t(`risk_${a.risk_level}`) : t('notAssessed')} large />}
          </View>
        </Row>
      </Card>

      {/* 1. PANTAU */}
      <JourneyHeader step={t('stepMonitor')} emoji="🌱" title={t('stepMonitorTitle')} />
      <Card>
        {m ? (
          <>
            <H2>{t('growthStatus')}</H2>
            <Row style={{ gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 24, fontWeight: '900' }}>
                  {m.height_cm} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '600' }}>cm</Text>
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>📏 {t('height_short')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 24, fontWeight: '900' }}>
                  {m.weight_kg} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '600' }}>kg</Text>
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>⚖️ {t('weight_short')}</Text>
              </View>
            </Row>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>
              {t('lastMeasured')}: {formatDate(m.measured_at, lang)}
            </Text>
          </>
        ) : (
          <P muted>{t('noMeasurementYet')}</P>
        )}
        <Button title={t('tileMeasure')} icon="add-circle" onPress={() => router.push(`/child/${id}/measure`)} />
        {m && (
          <Row style={{ marginTop: 8, gap: 8, alignItems: 'stretch' }}>
            <MetricTile label={t('height_short')} full={t('fHeightAge')} z={m.haz} kind="height" showZ={!mom} />
            <MetricTile label={t('weight_short')} full={t('fWeightAge')} z={m.waz} kind="weight" showZ={!mom} />
            <MetricTile label={t('bbtb_short')} full={t('fWeightHeight')} z={m.whz} kind="balance" showZ={!mom} />
          </Row>
        )}
      </Card>
      {m && <GrowthTrend childId={id} name={name} />}
      {history.length > 0 && (
        <Card>
          <H2 emoji="🗓️" right={<Button small variant="ghost" title={t('seeAll')} onPress={() => router.push(`/child/${id}/history`)} />}>
            {t('growthHistory')}
          </H2>
          {history.slice(0, 3).map((x, i) => (
            <Row key={x.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.line }}>
              <Text style={{ flex: 1.3, fontWeight: i === 0 ? '900' : '600' }}>{formatDate(x.measured_at, lang)}</Text>
              <Text style={{ flex: 1 }}>{x.height_cm} cm</Text>
              <Text style={{ flex: 1 }}>{x.weight_kg} kg</Text>
            </Row>
          ))}
        </Card>
      )}

      {/* 2. PAHAMI */}
      {a && (
        <>
          <JourneyHeader step={t('stepUnderstand')} emoji="🧠" title={t('stepUnderstandTitle')} />
          <AssessmentView a={a} />
        </>
      )}

      {/* 3. PERBAIKI */}
      <JourneyHeader step={t('stepImprove')} emoji="🍽️" title={t('stepImproveTitle')} />
      <Card>
        <DiversityCard groups={today.data?.groups_today ?? []} />
      </Card>
      <Card>
        <ListRow emoji="📸" title="NutriScan" subtitle={t('tileNutriScanSub')} onPress={() => router.push(`/nutriscan?child=${id}`)} />
        <ListRow emoji="✍️" title={t('actLogMeal')} subtitle={t('easyCheap')} onPress={() => router.push(`/child/${id}/meal?action=manual`)} />
        <ListRow emoji="🗓️" title={t('nutritionPlan')} onPress={() => router.push(`/child/${id}/nutrition`)} />
        <ListRow emoji="👩‍🍳" title={t('recipes')} onPress={() => router.push(`/child/${id}/recipes`)} />
      </Card>

      {/* 4. IKUTI */}
      <JourneyHeader step={t('stepFollow')} emoji="📅" title={t('stepFollowTitle')} />
      <DevelopmentSummary childId={id} name={name} />
      {mom && (
        <Card>
          <H2 emoji="🏅">{t('stickersTitle')}</H2>
          <Row style={{ justifyContent: 'space-between' }}>
            {stickers(meals.data ?? [], measurements.data ?? [], lang).map((s) => (
              <View key={s.key} style={{ alignItems: 'center', flex: 1 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: s.earned ? colors.accentSoft : colors.line, borderWidth: 2, borderColor: s.earned ? colors.accent : '#D5D0EA', borderStyle: s.earned ? 'solid' : 'dashed' }}>
                  <Text style={{ fontSize: 24, opacity: s.earned ? 1 : 0.4 }}>{s.emoji}</Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>{s.title}</Text>
                <Text style={{ fontSize: 12, color: s.earned ? colors.ok : colors.muted }}>{s.earned ? `✓ ${t('earned')}` : t('notYet')}</Text>
              </View>
            ))}
          </Row>
        </Card>
      )}

      {/* 5. TINDAK LANJUT */}
      <JourneyHeader step={t('stepFollowUp')} emoji="👩‍⚕️" title={`${t('teamOf')} ${name}`} />
      <Card>
        {c.care_team?.map((mbr) => (
          <Row key={mbr.role} style={{ paddingVertical: 8, gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tones.lavender.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 26 }}>{mbr.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800' }}>{mbr.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{mbr.label}</Text>
            </View>
            {mbr.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${mbr.phone}`)} accessibilityLabel={`${t('call')} ${mbr.name}`} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="call" size={20} color={colors.ok} />
              </Pressable>
            ) : null}
          </Row>
        ))}
        <Text style={{ marginTop: 8, color: colors.muted }}>
          {t('lastReviewed')}: {c.last_reviewed ? `${formatDate(c.last_reviewed.at, lang)} · ${c.last_reviewed.author}` : t('notReviewedYet')}
        </Text>
      </Card>
      {(c.professional_recommendations ?? []).slice(0, 3).map((r) => (
        <Card key={r.at + r.author} tint={statusColor.info.bg}>
          <SourceTag kind="pro" />
          <Text style={{ fontWeight: '800', color: statusColor.info.fg }}>
            {r.author} · {r.role_label}
          </Text>
          <Text style={{ color: statusColor.info.fg, fontSize: 13 }}>{formatDate(r.at, lang, true)}</Text>
          {r.text ? <P style={{ marginTop: 6 }}>{r.text}</P> : <P muted>{t('reviewConfirmed')}</P>}
        </Card>
      ))}
      {!c.professional_recommendations?.length && kader && (
        <P muted style={{ marginBottom: 12 }}>
          {t('askKader')} {kader.name}.
        </P>
      )}

      <Card>
        <H2 emoji="🔐">{t('dataPrivacy')}</H2>
        <ListRow emoji="📄" title={t('exportData')} onPress={exportFhir} />
        {isStaff(user) && <ListRow emoji="☁️" title="SATUSEHAT sync (FHIR)" onPress={syncSatusehat} />}
        {mom && <ListRow emoji="⚙️" title={t('privacySettings')} onPress={() => router.push('/privacy')} />}
        {(mom || user?.role === 'admin') && <Button small variant="danger" title={t('deleteChild')} icon="trash-outline" onPress={confirmDelete} loading={busy} />}
        {msg && <P muted>{msg}</P>}
      </Card>
    </Screen>
  );
}
