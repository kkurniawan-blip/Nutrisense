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
import { localDate } from '../../../lib/dates';
import { label, SYMPTOM_LABELS, YOUNG_INFANT_SYMPTOM_LABELS } from '../../../lib/i18n';
import { enqueue, uuid } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import type { Assessment, Child, Lang, SymptomReport } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor } from '../../../theme';

const COMMON = ['fever', 'cough', 'diarrhea', 'vomiting', 'runny_nose', 'poor_appetite'];
const URGENT = ['convulsions', 'fast_breathing', 'unable_to_drink', 'lethargy', 'bloody_stool', 'oedema'];
const OTHER = ['rash', 'worms', 'weight_loss', 'repeated_illness'];
// WHO IMCI, sick young infant (under 2 months): fever and poor feeding are danger signs too, and four signs only a
// newborn shows get their own tiles. Same set as the backend's YOUNG_INFANT_DANGER_SIGNS (ai/symptoms.py), so
// the call buttons appear at once, also offline when the server cannot be asked.
const YOUNG_INFANT_DAYS = 60;
const YOUNG_EXTRA = ['jaundice', 'cord_infection', 'hypothermia', 'grunting'];
const YOUNG_URGENT = [...URGENT, 'fever', 'poor_appetite', ...YOUNG_EXTRA];
const YOUNG_COMMON = COMMON.filter((k) => !YOUNG_URGENT.includes(k));

/** Days since birth from the child's record (cached, so it works offline); null while the record is loading. */
function ageDays(birth: string | undefined): number | null {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number);
  const [ty, tm, td] = localDate().split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
}

function symptomLabel(k: string, lang: Lang, young: boolean): string {
  return label(young && YOUNG_INFANT_SYMPTOM_LABELS[k] ? YOUNG_INFANT_SYMPTOM_LABELS : SYMPTOM_LABELS, k, lang);
}

function Tile({ k, on, danger, young, onPress }: { k: string; on: boolean; danger?: boolean; young: boolean; onPress: () => void }) {
  const { lang } = useAuth();
  return <SymptomTile emoji={SYMPTOM_EMOJI[k]} label={symptomLabel(k, lang, young)} on={on} danger={danger} onPress={onPress} />;
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
  const days = ageDays(child.data?.birth_date);
  const young = days !== null && days >= 0 && days < YOUNG_INFANT_DAYS;
  const urgentKeys = young ? YOUNG_URGENT : URGENT;
  const commonKeys = young ? YOUNG_COMMON : COMMON;
  const urgentSelected = selected.some((s) => urgentKeys.includes(s));
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
        {/* The server's answer, or what she ticked: a young-infant sign must bring the call buttons either way. */}
        {(r.danger_signs.length > 0 || urgentSelected) && <Escalation phone={kader?.phone} facility={child.data?.facility} />}
        <Card>
          <SourceTag kind="ai" />
          <H2 emoji="🧠">{t('interpretedAs')}</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {r.symptoms.map((s) => (
              <Chip key={s} emoji={SYMPTOM_EMOJI[s]} label={symptomLabel(s, lang, young)} selected tone={r.danger_signs.includes(s) ? 'danger' : undefined} />
            ))}
          </View>
          {r.duration_days ? <Text style={{ color: colors.muted }}>⏳ {r.duration_days} {lang === 'id' ? 'hari' : 'days'}</Text> : null}
          {result.other_concerns.map((c) => (
            <Text key={c} style={{ color: colors.muted, fontSize: 13 }}>
              • {c}
            </Text>
          ))}
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} compact hideEmergency={r.danger_signs.length > 0 || urgentSelected} />}
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
        {young && <Text style={{ fontWeight: '700', color: statusColor.urgent.fg, marginBottom: 8 }}>{t('youngInfantNote')}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {/* For a young baby, her own signs come first: they are the ones a mother would not think of. */}
          {(young ? [...YOUNG_EXTRA, 'fever', 'poor_appetite', ...URGENT] : URGENT).map((k) => (
            <Tile key={k} k={k} danger young={young} on={selected.includes(k)} onPress={() => toggle(k)} />
          ))}
        </View>
      </Card>

      <H2 emoji="🤒">{t('commonSymptoms')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {commonKeys.map((k) => (
          <Tile key={k} k={k} young={young} on={selected.includes(k)} onPress={() => toggle(k)} />
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
            <Tile key={k} k={k} young={young} on={selected.includes(k)} onPress={() => toggle(k)} />
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
