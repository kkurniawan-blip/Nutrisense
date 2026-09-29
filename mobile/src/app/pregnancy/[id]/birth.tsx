import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Mascot } from '../../../components/Mascot';
import { NifasList } from '../../../components/PregnancyParts';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, ErrorBox, Field, H2, IconChip, Row, Screen, Segmented, StatusPill, StepDots } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import type { Child, Pregnancy } from '../../../lib/types';
import { colors, statusColor, tones } from '../../../theme';

const today = () => new Date().toISOString().slice(0, 10);

/** Catat kelahiran: the baby, weight and length at birth, check, save. Creates the child's profile and starts nifas. */
export default function RecordBirth() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(today());
  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ child: Child; pregnancy: Pregnancy; low_birth_weight: boolean } | null>(null);
  const num = (s: string) => Number(s.replace(',', '.'));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`/api/pregnancies/${id}/birth`, { body: { birth_date: date, name: name.trim(), sex, birth_weight_kg: num(weight), birth_length_cm: num(length) } }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const c = result.child;
    return (
      <Screen>
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Mascot size={100} mood="cheer" bounce />
          <Text style={{ fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 8 }}>{t('congrats')}</Text>
        </View>
        <Card onPress={() => router.replace(`/child/${c.id}`)}>
          <Row style={{ gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.sex === 'female' ? colors.pinkSoft : colors.skySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 32 }}>👶</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 19, fontWeight: '800' }}>{c.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {weight} kg · {length} cm · {formatDate(date, lang)}
              </Text>
              <StatusPill status={result.low_birth_weight ? 'action' : 'ok'} label={result.low_birth_weight ? 'BBLR' : t('childCreated')} />
            </View>
          </Row>
          {result.low_birth_weight && <Text style={{ marginTop: 10, color: statusColor.action.fg }}>{t('lowBirthWeight')}</Text>}
        </Card>
        {result.pregnancy.nifas && (
          <Card>
            <H2>{t('nifasTitle')}</H2>
            <NifasList nifas={result.pregnancy.nifas} />
          </Card>
        )}
        <Button title={t('openChild')} icon="arrow-forward" onPress={() => router.replace(`/child/${c.id}`)} />
        <Button title={t('backHome')} variant="ghost" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <StepDots total={3} current={step - 1} label={`${t('step')} ${step} ${t('of')} 3`} />

      {step === 1 && (
        <>
          <Bubble mood="cheer">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('babyBorn')} 👶</Text>
          </Bubble>
          <Card>
            <Field label={t('babyName')} value={name} onChangeText={setName} />
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>{t('sex')}</Text>
            <Segmented<'female' | 'male'>
              value={sex}
              onChange={setSex}
              options={[
                { value: 'female', label: `👧 ${t('female')}` },
                { value: 'male', label: `👦 ${t('male')}` },
              ]}
            />
            <Field label={`🗓️ ${t('birthDate')}`} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
          </Card>
          <Button title={t('next')} icon="arrow-forward" disabled={!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '900', marginBottom: 12 }}>{t('birthSizeTitle')}</Text>
            <Field label={`⚖️ ${t('birthWeightKg')}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="3.0" />
            <Field label={`📏 ${t('birthLengthCm')}`} value={length} onChangeText={setLength} keyboardType="decimal-pad" placeholder="49" />
          </Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" disabled={!weight || !length} onPress={() => setStep(3)} />
            </View>
          </Row>
        </>
      )}

      {step === 3 && (
        <>
          <Bubble mood="thinking">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('reviewTitle')}</Text>
          </Bubble>
          <Card>
            {[
              { icon: 'happy' as const, tone: sex === 'female' ? ('pink' as const) : ('blue' as const), value: name, label: sex === 'female' ? t('female') : t('male') },
              { icon: 'scale' as const, tone: 'orange' as const, value: `${weight} kg`, label: t('birthWeightKg') },
              { icon: 'resize' as const, tone: 'blue' as const, value: `${length} cm`, label: t('birthLengthCm') },
              { icon: 'calendar' as const, tone: 'lavender' as const, value: formatDate(date, lang), label: t('birthDate') },
            ].map((r) => (
              <Row key={r.label} style={{ gap: 14, paddingVertical: 10 }}>
                <IconChip icon={r.icon} tone={r.tone} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900' }}>{r.value}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{r.label}</Text>
                </View>
              </Row>
            ))}
          </Card>
          {num(weight) > 0 && num(weight) < 2.5 && (
            <Card tint={tones.orange.bg}>
              <Text style={{ color: statusColor.action.fg, fontWeight: '700' }}>{t('lowBirthWeight')}</Text>
            </Card>
          )}
          {error && <ErrorBox message={error} />}
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('edit')} variant="ghost" icon="create-outline" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('save')} icon="checkmark-circle" loading={busy} onPress={save} />
            </View>
          </Row>
        </>
      )}
    </Screen>
  );
}
