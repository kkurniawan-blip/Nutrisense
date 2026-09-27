import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';

import { AssessmentView } from '../../../components/AssessmentView';
import { Button, Card, ErrorBox, Field, P, Screen, Segmented } from '../../../components/ui';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { enqueue, uuid } from '../../../lib/offline';
import type { Assessment, Child, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Measure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useAuth();
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
    const body = {
      weight_kg: num(weight),
      height_cm: num(height),
      muac_cm: muac ? num(muac) : null,
      position: pos,
      measured_at: date,
      client_uuid: uuid(),
    };
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
    return (
      <Screen>
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <P>
            ✓ {m.measured_at}: {m.height_cm} cm · {m.weight_kg} kg → HAZ {m.haz ?? '–'} · WAZ {m.waz ?? '–'} · WHZ {m.whz ?? '–'}
          </P>
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} />}
        <Button title={t('open')} onPress={() => router.replace(`/child/${id}`)} icon="arrow-forward" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <P muted style={{ marginBottom: 8 }}>
          {child.data?.name} · {Math.floor(child.data?.age_months ?? 0)} {t('months')}
        </P>
        <Field label={t('weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="10.4" />
        <Field label={t('height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="82.5" />
        <P muted>{t('position')}</P>
        <Segmented
          value={pos}
          onChange={setPosition}
          options={[
            { value: 'lying', label: t('lying') },
            { value: 'standing', label: t('standing') },
          ]}
        />
        <Field label={t('muac')} value={muac} onChangeText={setMuac} keyboardType="decimal-pad" />
        <Field label={t('measuredAt')} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
      </Card>
      {error && <ErrorBox message={error} />}
      {info && (
        <Card style={{ backgroundColor: colors.warnSoft }}>
          <P>{info}</P>
        </Card>
      )}
      <Button title={t('save')} onPress={submit} loading={busy} icon="save-outline" />
      <P muted style={{ fontSize: 12, textAlign: 'center' }}>
        {t('disclaimer')}
      </P>
    </Screen>
  );
}
