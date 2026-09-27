import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AssessmentView } from '../../../components/AssessmentView';
import { Badge, Button, Card, Chip, ErrorBox, Field, H2, P, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { label, SYMPTOM_LABELS } from '../../../lib/i18n';
import type { Assessment, SymptomReport } from '../../../lib/types';
import { colors } from '../../../theme';

const QUICK = ['diarrhea', 'fever', 'cough', 'vomiting', 'poor_appetite', 'rash', 'convulsions', 'unable_to_drink', 'lethargy', 'fast_breathing', 'oedema'];
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
      setResult(await api(`/api/children/${id}/symptoms`, { body: { description: text, symptoms: selected } }));
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
          <H2 right={<Badge text={t(r.interpreted_by.startsWith('claude') ? 'aiBy_claude' : 'aiBy_rules')} fg={colors.info} bg={colors.infoSoft} />}>
            {t('interpretedAs')}
          </H2>
          {r.summary && <P style={{ marginBottom: 6 }}>{r.summary}</P>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {r.symptoms.map((s) => (
              <Chip key={s} label={label(SYMPTOM_LABELS, s, lang)} selected tone={r.danger_signs.includes(s) ? 'danger' : undefined} />
            ))}
          </View>
          {r.duration_days ? <P muted>{r.duration_days} hari / days</P> : null}
          {result.other_concerns.map((c) => (
            <P key={c} muted>
              • {c}
            </P>
          ))}
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} compact />}
        <Button title={t('reportSymptoms')} variant="ghost" onPress={() => setResult(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Field label={t('describeSymptoms')} value={text} onChangeText={setText} multiline placeholder={t('symptomsPlaceholder')} />
        <P muted style={{ marginBottom: 6 }}>{t('quickSelect')}</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {QUICK.map((k) => (
            <Chip key={k} label={label(SYMPTOM_LABELS, k, lang)} selected={selected.includes(k)} onPress={() => toggle(k)} tone={DANGER.has(k) ? 'danger' : undefined} />
          ))}
        </View>
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('checkSymptoms')} onPress={submit} loading={busy} disabled={!text.trim() && !selected.length} icon="pulse-outline" />
    </Screen>
  );
}
