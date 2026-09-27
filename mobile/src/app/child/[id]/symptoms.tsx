import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AssessmentView } from '../../../components/AssessmentView';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, H2, PressScale, Row, Screen, SourceTag } from '../../../components/ui';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { SYMPTOM_EMOJI } from '../../../lib/fun';
import { label, SYMPTOM_LABELS } from '../../../lib/i18n';
import { enqueue, uuid } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import type { Assessment, Child, SymptomReport } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, radius, statusColor } from '../../../theme';

const COMMON = ['fever', 'cough', 'diarrhea', 'vomiting', 'runny_nose', 'poor_appetite'];
const URGENT = ['convulsions', 'fast_breathing', 'unable_to_drink', 'lethargy', 'bloody_stool', 'oedema'];
const OTHER = ['rash', 'worms', 'weight_loss', 'repeated_illness'];

function Tile({ k, on, danger, onPress }: { k: string; on: boolean; danger?: boolean; onPress: () => void }) {
  const { lang } = useAuth();
  const tint = danger ? colors.danger : colors.primary;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{ width: '31%', alignItems: 'center', paddingVertical: 12, minHeight: 88, borderRadius: radius.md, backgroundColor: on ? tint : '#fff', borderWidth: 2, borderColor: on ? tint : danger ? '#F3B9BE' : colors.border }}
    >
      <Text style={{ fontSize: 28 }}>{SYMPTOM_EMOJI[k]}</Text>
      <Text style={{ fontSize: 13, fontWeight: '800', textAlign: 'center', color: on ? '#fff' : colors.text, marginTop: 4 }}>
        {on ? '✓ ' : ''}
        {label(SYMPTOM_LABELS, k, lang)}
      </Text>
    </PressScale>
  );
}

function Escalation({ phone, kaderName }: { phone?: string | null; kaderName?: string }) {
  const { t } = useAuth();
  return (
    <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
      <Row>
        <Ionicons name="warning" size={28} color={colors.danger} />
        <Text style={{ flex: 1, fontSize: 19, fontWeight: '900', color: colors.danger }}>🚨 {t('seekHelpNow')}</Text>
      </Row>
      <Text style={{ marginTop: 6, fontSize: 16, lineHeight: 23 }}>{t('urgentExplain')}</Text>
      {phone ? (
        <Button variant="danger" title={`${t('call')} ${kaderName ?? 'Kader'}`} icon="call" onPress={() => Linking.openURL(`tel:${phone}`)} />
      ) : null}
      <Button variant="ghost" title={t('healthGuide')} icon="book" onPress={() => router.push('/guide')} />
    </Card>
  );
}

export default function Symptoms() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const sync = useSync();
  const child = useApi<Child>(`/api/children/${id}`);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [result, setResult] = useState<{ report: SymptomReport; assessment: Assessment | null; other_concerns: string[] } | null>(null);

  const kader = child.data?.care_team?.find((m) => m.role === 'kader');
  const name = child.data?.name.split(' ')[0] ?? '';
  const urgentSelected = selected.some((s) => URGENT.includes(s));
  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const submit = async () => {
    const body = { description: text, symptoms: selected, client_uuid: uuid() };
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`/api/children/${id}/symptoms`, { body, timeoutMs: 120000 }));
    } catch (e) {
      if (e instanceof NetworkError) {
        await enqueue('symptom', Number(id), child.data?.name ?? '', body);
        await sync.refresh();
        setOfflineSaved(true);
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (offlineSaved)
    return (
      <Screen>
        {urgentSelected && <Escalation phone={kader?.phone} kaderName={kader?.name} />}
        <Card tint={statusColor.info.bg}>
          <Text style={{ fontWeight: '900', color: statusColor.info.fg }}>📶 {t('savedOnPhone')}</Text>
          <Text style={{ color: statusColor.info.fg }}>{t('symptomOfflineNote')}</Text>
        </Card>
        <Button title={t('open')} icon="arrow-forward" onPress={() => router.replace(`/child/${id}`)} />
      </Screen>
    );

  if (result) {
    const r = result.report;
    return (
      <Screen>
        {r.danger_signs.length > 0 && <Escalation phone={kader?.phone} kaderName={kader?.name} />}
        <Card>
          <SourceTag kind="ai" />
          <H2 emoji="🧠">{t('interpretedAs')}</H2>
          {r.summary && <Text style={{ marginBottom: 8 }}>{r.summary}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {r.symptoms.map((s) => (
              <Chip key={s} emoji={SYMPTOM_EMOJI[s]} label={label(SYMPTOM_LABELS, s, lang)} selected tone={r.danger_signs.includes(s) ? 'danger' : undefined} />
            ))}
          </View>
          {r.duration_days ? <Text style={{ color: colors.muted }}>⏳ {r.duration_days} {lang === 'id' ? 'hari' : 'days'}</Text> : null}
          {result.other_concerns.map((c) => (
            <Text key={c} style={{ color: colors.muted }}>
              • {c}
            </Text>
          ))}
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} compact />}
        <Button title={t('reportSymptoms')} variant="ghost" onPress={() => setResult(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Bubble mood="caring">
        {t('howIs')} {name} {t('today')}?
      </Bubble>
      {urgentSelected && <Escalation phone={kader?.phone} kaderName={kader?.name} />}

      <H2 emoji="🤒">{t('commonSymptoms')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {COMMON.map((k) => (
          <Tile key={k} k={k} on={selected.includes(k)} onPress={() => toggle(k)} />
        ))}
      </View>

      <Card tint={statusColor.urgent.bg}>
        <H2 emoji="🚨">{t('urgentSigns')}</H2>
        <Text style={{ color: statusColor.urgent.fg, marginTop: -4, marginBottom: 10 }}>{t('urgentSignsSub')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {URGENT.map((k) => (
            <Tile key={k} k={k} danger on={selected.includes(k)} onPress={() => toggle(k)} />
          ))}
        </View>
      </Card>

      <Pressable onPress={() => setShowOther(!showOther)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontWeight: '800', color: colors.primaryDark }}>
          {showOther ? '▲' : '▼'} {t('otherSymptoms')}
        </Text>
      </Pressable>
      {showOther && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {OTHER.map((k) => (
            <Tile key={k} k={k} on={selected.includes(k)} onPress={() => toggle(k)} />
          ))}
        </View>
      )}

      <Card>
        <Field label={`💬 ${t('describeSymptoms')}`} value={text} onChangeText={setText} multiline placeholder={t('symptomsPlaceholder')} />
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('checkSymptoms')} onPress={submit} loading={busy} disabled={!text.trim() && !selected.length} icon="pulse" />
    </Screen>
  );
}
