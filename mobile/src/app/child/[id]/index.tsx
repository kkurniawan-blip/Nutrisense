import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import { AssessmentView, fmtZ } from '../../../components/AssessmentView';
import { ChartData, GrowthChart } from '../../../components/GrowthChart';
import { SyncBanner } from '../../../components/SyncBanner';
import { Text } from '../../../components/Text';
import {
  Button,
  Card,
  ErrorBox,
  H2,
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
import type { Child, Development, Meal, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor, tones } from '../../../theme';

type Indicator = 'hfa' | 'wfa' | 'wfh';

const METRIC = {
  height: { tone: tones.blue, icon: 'resize' },
  weight: { tone: tones.orange, icon: 'scale' },
  balance: { tone: tones.green, icon: 'body' },
} as const;

/** One growth indicator as a small pastel tile: the number (SD), and underneath it in words. */
function MetricTile({ label, full, z, kind }: { label: string; full: string; z: number | null; kind: 'height' | 'weight' | 'balance' }) {
  const { lang } = useAuth();
  const w = zWords(z, lang, kind);
  const c = statusColor[w.key];
  const m = METRIC[kind];
  return (
    <View accessible accessibilityLabel={`${full}: ${fmtZ(z)} SD, ${w.text}`} style={{ flex: 1, backgroundColor: m.tone.bg, borderRadius: 18, padding: 12, gap: 4 }}>
      <Row style={{ gap: 5 }}>
        <Ionicons name={m.icon} size={14} color={m.tone.fg} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: m.tone.fg }}>{label}</Text>
      </Row>
      <Text style={{ fontSize: 20, fontWeight: '900', color: c.fg }}>
        {fmtZ(z)} <Text style={{ fontSize: 12, fontWeight: '600' }}>SD</Text>
      </Text>
      <Row style={{ gap: 5, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 5 }}>
          <StatusMark status={w.key} size={7} />
        </View>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: 11.5, lineHeight: 15, color: c.fg }}>
          {w.text}
        </Text>
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

const DEV_ICON = { on_track: '✓', monitor: '●', unknown: '○' } as const;

/** Development at a glance: each area with an icon and a tick or a dot, nothing more. */
function DevelopmentSummary({ childId }: { childId: string }) {
  const { t } = useAuth();
  const dev = useApi<Development>(`/api/children/${childId}/development`);
  if (!dev.data || dev.data.band_months === null) return null;
  const map = { on_track: 'ok', monitor: 'monitor', unknown: 'unknown' } as const;
  return (
    <Card onPress={() => router.push(`/child/${childId}/development`)}>
      <H2 right={<Ionicons name="chevron-forward" size={18} color="#A09CB5" />}>{t('development')}</H2>
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
  const kader = c.care_team?.find((x) => x.role === 'kader');

  return (
    <Screen refreshing={child.loading} onRefresh={reload}>
      <Stack.Screen options={{ title: c.name }} />
      <SyncBanner stale={child.stale} />

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
          {mom ? <StatusPill status={st.key} label={txt(st.label, lang)} /> : <StatusPill status={clinicalStatus(a?.risk_level)} label={a ? t(`risk_${a.risk_level}`) : t('notAssessed')} />}
        </View>
      </Row>

      {/* The three growth numbers */}
      {m ? (
        <Row style={{ gap: 8, alignItems: 'stretch' }}>
          <MetricTile label={t('height_short')} full={t('fHeightAge')} z={m.haz} kind="height" />
          <MetricTile label={t('weight_short')} full={t('fWeightAge')} z={m.waz} kind="weight" />
          <MetricTile label={t('bbtb_short')} full={t('fWeightHeight')} z={m.whz} kind="balance" />
        </Row>
      ) : (
        <P muted>{t('noMeasurementYet')}</P>
      )}
      <View style={{ marginTop: 10, marginBottom: 10 }}>
        <Button title={t('tileMeasure')} icon="add-circle" onPress={() => router.push(`/child/${id}/measure`)} />
      </View>

      {m && <GrowthTrend childId={id} name={name} />}

      {/* Nuri's short guidance and what to do */}
      {a && <AssessmentView a={a} />}

      <DevelopmentSummary childId={id} />

      {/* Food shortcuts */}
      <Card>
        <Row style={{ alignItems: 'flex-start', gap: 4 }}>
          <QuickAction emoji="📸" tone="orange" label="NutriScan" onPress={() => router.push(`/nutriscan?child=${id}`)} />
          <QuickAction emoji="✍️" tone="green" label={t('actLogMeal')} onPress={() => router.push(`/child/${id}/meal?action=manual`)} />
          <QuickAction emoji="🗓️" tone="blue" label={t('nutritionPlan')} onPress={() => router.push(`/child/${id}/nutrition`)} />
          <QuickAction emoji="👩‍🍳" tone="pink" label={t('recipes')} onPress={() => router.push(`/child/${id}/recipes`)} />
        </Row>
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
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>{mbr.label}</Text>
              <Row style={{ gap: 5 }}>
                <StatusMark status="ok" size={7} />
                <Text style={{ fontSize: 12, color: statusColor.ok.fg }}>{t('active')}</Text>
              </Row>
            </View>
            {mbr.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${mbr.phone}`)} accessibilityLabel={`${t('call')} ${mbr.name}`} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="call" size={20} color={colors.ok} />
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
          {isStaff(user) && <ListRow emoji="☁️" title="SATUSEHAT sync (FHIR)" onPress={syncSatusehat} />}
          {mom && <ListRow emoji="⚙️" title={t('privacySettings')} onPress={() => router.push('/privacy')} />}
          {(mom || user?.role === 'admin') && <Button small variant="danger" title={t('deleteChild')} icon="trash-outline" onPress={confirmDelete} loading={busy} />}
          {msg && <P muted>{msg}</P>}
        </Card>
      )}
    </Screen>
  );
}
