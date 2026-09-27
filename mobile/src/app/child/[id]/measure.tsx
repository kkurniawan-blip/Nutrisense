import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AssessmentView } from '../../../components/AssessmentView';
import { Mascot } from '../../../components/Mascot';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, ErrorBox, Field, Row, Screen, Segmented } from '../../../components/ui';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatAge } from '../../../lib/fun';
import { enqueue, uuid } from '../../../lib/offline';
import type { Assessment, Child, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

const today = () => new Date().toISOString().slice(0, 10);

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <Row style={{ marginBottom: 8 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '900' }}>{n}</Text>
      </View>
      <Text style={{ fontWeight: '800', fontSize: 16 }}>{text}</Text>
    </Row>
  );
}

export default function Measure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [muac, setMuac] = useState('');
  const [date, setDate] = useState(today());
  const [position, setPosition] = useState<'lying' | 'standing' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<{ measurement: Measurement; assessment: Assessment | null } | null>(null);

  const pos = position ?? ((child.data?.age_months ?? 0) < 24 ? 'lying' : 'standing');
  const num = (s: string) => Number(s.replace(',', '.'));

  const submit = async () => {
    if (!weight || !height) {
      setError(t('required'));
      return;
    }
    const body = { weight_kg: num(weight), height_cm: num(height), muac_cm: muac ? num(muac) : null, position: pos, measured_at: date, client_uuid: uuid() };
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      setResult(await api(`/api/children/${id}/measurements`, { body }));
    } catch (e) {
      if (e instanceof NetworkError) {
        // Offline-first: keep the measurement on the phone and sync later.
        const n = await enqueue({ ...body, child_id: Number(id), child_name: child.data?.name ?? '' });
        setInfo(`${t('offlineQueued')} (${n})`);
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const m = result.measurement;
    const good = result.assessment?.risk_level === 'low';
    return (
      <Screen>
        <View style={{ alignItems: 'center', marginVertical: 6 }}>
          <Mascot size={100} mood={good ? 'cheer' : 'caring'} bounce={good} />
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.primaryDark, textAlign: 'center', marginTop: 6 }}>
            {good ? t('celebrate') : t('supportive')}
          </Text>
        </View>
        <Card tint={colors.mintSoft}>
          <Row style={{ justifyContent: 'space-around' }}>
            <Text style={{ fontSize: 18, fontWeight: '900' }}>📏 {m.height_cm} cm</Text>
            <Text style={{ fontSize: 18, fontWeight: '900' }}>⚖️ {m.weight_kg} kg</Text>
          </Row>
          <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 4 }}>{m.measured_at}</Text>
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} />}
        <Button title={t('open')} onPress={() => router.replace(`/child/${id}`)} icon="arrow-forward" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Bubble mood="happy">
        <Text style={{ fontWeight: '800' }}>
          {child.data?.name} · {formatAge(child.data?.age_months ?? 0, lang)}
        </Text>
        <Text style={{ marginTop: 4 }}>{t('measureTip')}</Text>
      </Bubble>
      <Card>
        <StepLabel n={1} text={`⚖️ ${t('weight')}`} />
        <Field label="" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="10.4" />
        <StepLabel n={2} text={`📏 ${t('height')}`} />
        <Segmented
          value={pos}
          onChange={setPosition}
          options={[
            { value: 'lying', label: `🛏️ ${t('lying')}` },
            { value: 'standing', label: `🧍 ${t('standing')}` },
          ]}
        />
        <Field label="" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="82.5" />
        <StepLabel n={3} text={`🗓️ ${t('measuredAt')}`} />
        <Field label="" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <Field label={`💪 ${t('muac')}`} value={muac} onChangeText={setMuac} keyboardType="decimal-pad" />
      </Card>
      {error && <ErrorBox message={error} />}
      {info && (
        <Card tint={colors.accentSoft}>
          <Text>📶 {info}</Text>
        </Card>
      )}
      <Button title={t('save')} onPress={submit} loading={busy} icon="checkmark-circle" />
      <Text style={{ fontSize: 12, textAlign: 'center', color: colors.muted, marginTop: 6 }}>{t('disclaimer')}</Text>
    </Screen>
  );
}
