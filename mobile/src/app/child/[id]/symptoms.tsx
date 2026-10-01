import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AssessmentView } from '../../../components/AssessmentView';
import { Escalation, SymptomTile } from '../../../components/SymptomTiles';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, H2, Screen, SourceTag } from '../../../components/ui';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { SYMPTOM_EMOJI } from '../../../lib/fun';
import { label, SYMPTOM_LABELS } from '../../../lib/i18n';
import { enqueue, uuid } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import type { Assessment, Child, SymptomReport } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor } from '../../../theme';

const COMMON = ['fever', 'cough', 'diarrhea', 'vomiting', 'runny_nose', 'poor_appetite'];
const URGENT = ['convulsions', 'fast_breathing', 'unable_to_drink', 'lethargy', 'bloody_stool', 'oedema'];
const OTHER = ['rash', 'worms', 'weight_loss', 'repeated_illness'];

function Tile({ k, on, danger, onPress }: { k: string; on: boolean; danger?: boolean; onPress: () => void }) {
  const { lang } = useAuth();
  return <SymptomTile emoji={SYMPTOM_EMOJI[k]} label={label(SYMPTOM_LABELS, k, lang)} on={on} danger={danger} onPress={onPress} />;
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
      <Screen key="result0">
        {urgentSelected && <Escalation phone={kader?.phone} facility={child.data?.facility} />}
        <Card tint={statusColor.info.bg}>
          <Text style={{ fontWeight: '900', color: statusColor.info.fg }}>📶 {t('savedOnPhone')}</Text>
          <Text style={{ color: statusColor.info.fg }}>{t('symptomOfflineNote')}</Text>
        </Card>
        <Button title={`${t('seeProfileOf')} ${name}`} icon="arrow-forward" onPress={() => router.replace(`/child/${id}`)} />
      </Screen>
    );

  if (result) {
    const r = result.report;
    return (
      <Screen key="result1">
        {r.danger_signs.length > 0 && <Escalation phone={kader?.phone} facility={child.data?.facility} />}
        <Card>
          <SourceTag kind="ai" />
          <H2 emoji="🧠">{t('interpretedAs')}</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {r.symptoms.map((s) => (
              <Chip key={s} emoji={SYMPTOM_EMOJI[s]} label={label(SYMPTOM_LABELS, s, lang)} selected tone={r.danger_signs.includes(s) ? 'danger' : undefined} />
            ))}
          </View>
          {r.duration_days ? <Text style={{ color: colors.muted }}>⏳ {r.duration_days} {lang === 'id' ? 'hari' : 'days'}</Text> : null}
          {result.other_concerns.map((c) => (
            <Text key={c} style={{ color: colors.muted, fontSize: 13 }}>
              • {c}
            </Text>
          ))}
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} compact hideEmergency={r.danger_signs.length > 0} />}
        <Button title={t('reportSymptoms')} variant="ghost" onPress={() => setResult(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Bubble mood="caring">
        {t('howIs')} {name} {t('today')}?
      </Bubble>
      {urgentSelected && <Escalation phone={kader?.phone} facility={child.data?.facility} />}

      <Card tint={statusColor.urgent.bg}>
        <H2 emoji="🚨">{t('urgentSigns')}</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {URGENT.map((k) => (
            <Tile key={k} k={k} danger on={selected.includes(k)} onPress={() => toggle(k)} />
          ))}
        </View>
      </Card>

      <H2 emoji="🤒">{t('commonSymptoms')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {COMMON.map((k) => (
          <Tile key={k} k={k} on={selected.includes(k)} onPress={() => toggle(k)} />
        ))}
      </View>

      <Pressable onPress={() => setShowOther(!showOther)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontWeight: '800', color: colors.primary }}>
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
