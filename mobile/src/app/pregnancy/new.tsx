import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { AboutMomCard, HphtCard, HphtMode, gestation } from '../../components/PregnancyForm';
import { Bubble, Button, Card, ErrorBox, IconChip, Row, Screen, StepDots } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { EDUCATION, label, weeksText } from '../../lib/pregnancy';
import type { Pregnancy } from '../../lib/types';
import { colors } from '../../theme';


/** Tambah kehamilan: HPHT (or weeks), about the mother, then check and save. Same shape as Catat pengukuran. */
export default function NewPregnancy() {
  const { t, lang } = useAuth();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<HphtMode>('date');
  const [hpht, setHpht] = useState('');
  const [weeks, setWeeks] = useState('');
  const [height, setHeight] = useState('');
  const [education, setEducation] = useState<string | null>(null);
  const [gravida, setGravida] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => Number(s.replace(',', '.'));
  const { ga, valid, body: gaBody } = gestation(mode, hpht, weeks);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...gaBody,
        mother_height_cm: height ? num(height) : null,
        education,
        gravida,
      };
      const p = await api<Pregnancy>('/api/pregnancies', { body });
      router.replace(`/pregnancy/${p.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <StepDots total={3} current={step - 1} label={`${t('step')} ${step} ${t('of')} 3`} />

      {step === 1 && (
        <>
          <Bubble mood="cheer">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('hphtQ')}</Text>
          </Bubble>
          <HphtCard mode={mode} setMode={setMode} hpht={hpht} setHpht={setHpht} weeks={weeks} setWeeks={setWeeks} />
          <Button title={t('next')} icon="arrow-forward" disabled={!valid} onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Bubble mood="happy">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('aboutMom')}</Text>
          </Bubble>
          <AboutMomCard height={height} setHeight={setHeight} education={education} setEducation={setEducation} gravida={gravida} setGravida={setGravida} />
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" onPress={() => setStep(3)} />
            </View>
          </Row>
        </>
      )}

      {step === 3 && ga && (
        <>
          <Bubble mood="thinking">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('reviewTitle')}</Text>
          </Bubble>
          <Card>
            {[
              { icon: 'calendar' as const, tone: 'pink' as const, value: weeksText(ga.weeks, ga.extra, lang), label: t('pregnancyAge') },
              { icon: 'heart' as const, tone: 'lavender' as const, value: formatDate(ga.hpl, lang), label: t('hplLabel') },
              { icon: 'resize' as const, tone: 'blue' as const, value: height ? `${height} cm` : '–', label: t('motherHeight') },
              { icon: 'school' as const, tone: 'green' as const, value: education ? label(EDUCATION, education, lang) : '–', label: t('educationLbl') },
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
