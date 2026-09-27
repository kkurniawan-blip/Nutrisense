import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AssessmentView } from '../../../components/AssessmentView';
import { Text } from '../../../components/Text';
import { Badge, Bubble, Button, Card, Chip, ErrorBox, Field, H2, PressScale, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { SYMPTOM_EMOJI } from '../../../lib/fun';
import { label, SYMPTOM_LABELS } from '../../../lib/i18n';
import type { Assessment, SymptomReport } from '../../../lib/types';
import { colors, radius } from '../../../theme';

const QUICK = ['diarrhea', 'fever', 'cough', 'runny_nose', 'vomiting', 'poor_appetite', 'rash', 'worms', 'convulsions', 'unable_to_drink', 'lethargy', 'fast_breathing', 'oedema'];
const DANGER = new Set(['convulsions', 'unable_to_drink', 'lethargy', 'fast_breathing', 'oedema', 'vomits_everything', 'bloody_stool']);

export default function Symptoms() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ report: SymptomReport; assessment: Assessment | null; other_concerns: string[] } | null>(null);

  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`/api/children/${id}/symptoms`, { body: { description: text, symptoms: selected }, timeoutMs: 120000 }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const r = result.report;
    return (
      <Screen>
        <Card>
          <H2 emoji="🧠" right={<Badge text={t(r.interpreted_by.startsWith('claude') ? 'aiBy_claude' : 'aiBy_rules')} fg={colors.info} bg={colors.infoSoft} />}>
            {t('interpretedAs')}
          </H2>
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
      <Bubble mood="caring">{t('howAreYou')}</Bubble>
      <Text style={{ fontWeight: '800', marginBottom: 8 }}>{t('quickSelect')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {QUICK.map((k) => {
          const on = selected.includes(k);
          const danger = DANGER.has(k);
          const tint = danger ? colors.danger : colors.primary;
          return (
            <PressScale
              key={k}
              onPress={() => toggle(k)}
              style={{
                width: '31%',
                alignItems: 'center',
                paddingVertical: 12,
                borderRadius: radius.md,
                backgroundColor: on ? tint : '#fff',
                borderWidth: 2,
                borderColor: on ? tint : danger ? '#F6C7CB' : colors.border,
              }}
            >
              <Text style={{ fontSize: 28 }}>{SYMPTOM_EMOJI[k]}</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', textAlign: 'center', color: on ? '#fff' : colors.text, marginTop: 4 }}>
                {label(SYMPTOM_LABELS, k, lang)}
              </Text>
            </PressScale>
          );
        })}
      </View>
      <Card>
        <Field label={`💬 ${t('describeSymptoms')}`} value={text} onChangeText={setText} multiline placeholder={t('symptomsPlaceholder')} />
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('checkSymptoms')} onPress={submit} loading={busy} disabled={!text.trim() && !selected.length} icon="pulse" />
    </Screen>
  );
}
