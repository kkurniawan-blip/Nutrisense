import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, IconChip, Row, Screen, Segmented, StepDots } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { EDUCATION, fromHpht, hphtFromWeeks, label, weeksText } from '../../lib/pregnancy';
import type { Pregnancy } from '../../lib/types';
import { colors } from '../../theme';

type Mode = 'date' | 'weeks';

/** Tambah kehamilan: HPHT (or weeks), about the mother, then check and save. Same shape as Catat pengukuran. */
export default function NewPregnancy() {
  const { t, lang } = useAuth();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>('date');
  const [hpht, setHpht] = useState('');
  const [weeks, setWeeks] = useState('');
  const [height, setHeight] = useState('');
  const [education, setEducation] = useState<string | null>(null);
  const [gravida, setGravida] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => Number(s.replace(',', '.'));
  const start = mode === 'date' ? (/^\d{4}-\d{2}-\d{2}$/.test(hpht) ? hpht : null) : weeks && num(weeks) >= 1 && num(weeks) <= 42 ? hphtFromWeeks(num(weeks)) : null;
  const ga = start ? fromHpht(start) : null;
  const valid = !!ga && ga.days >= 0 && ga.weeks <= 44;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...(mode === 'date' ? { hpht } : { gestational_weeks: num(weeks) }),
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
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'date', label: t('hphtDate') },
              { value: 'weeks', label: t('weeksNow') },
            ]}
          />
          <Card>
            {mode === 'date' ? (
              <Field label={`🗓️ ${t('hphtDate')} (TTTT-BB-HH)`} value={hpht} onChangeText={setHpht} placeholder="2026-04-10" keyboardType="numbers-and-punctuation" />
            ) : (
              <Field label={`🤰 ${t('weeksField')}`} value={weeks} onChangeText={setWeeks} placeholder="20" keyboardType="decimal-pad" />
            )}
            {valid && ga && (
              <Row style={{ gap: 12, marginTop: 4 }}>
                <IconChip emoji="🤰" tone="pink" size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900' }}>{weeksText(ga.weeks, ga.extra, lang)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {t('hplLabel')}: {formatDate(ga.hpl, lang)}
                  </Text>
                </View>
              </Row>
            )}
          </Card>
          <Button title={t('next')} icon="arrow-forward" disabled={!valid} onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Bubble mood="happy">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('aboutMom')}</Text>
          </Bubble>
          <Card>
            <Field label={`📏 ${t('heightMomField')}`} value={height} onChangeText={setHeight} placeholder="152" keyboardType="decimal-pad" />
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>🎓 {t('educationLbl')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {EDUCATION.map((e) => (
                <Chip key={e.key} label={e.label[lang]} selected={education === e.key} onPress={() => setEducation(education === e.key ? null : e.key)} />
              ))}
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 }}>🤰 {t('whichPregnancy')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} label={n === 5 ? '5+' : String(n)} selected={gravida === n} onPress={() => setGravida(gravida === n ? null : n)} />
              ))}
            </View>
          </Card>
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
