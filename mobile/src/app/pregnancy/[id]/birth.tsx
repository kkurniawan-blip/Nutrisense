import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Mascot } from '../../../components/Mascot';
import { NifasList } from '../../../components/PregnancyParts';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, H2, IconChip, Row, Screen, Segmented, StatusPill, StepDots } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { localDate } from '../../../lib/dates';
import { formatDate } from '../../../lib/fun';
import { BIRTH_ATTENDANTS, BIRTH_PLACES_DONE, label } from '../../../lib/pregnancy';
import type { Child, Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor, tones } from '../../../theme';


/** Catat kelahiran: the baby, weight and length at birth, check, save. Creates the child's profile and starts nifas. */
export default function RecordBirth() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(localDate());
  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [place, setPlace] = useState<string | null>(null);
  const [attendant, setAttendant] = useState<string | null>(null);
  const [weeksIn, setWeeksIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ child: Child; pregnancy: Pregnancy; low_birth_weight: boolean; premature: boolean; gestational_weeks: number } | null>(null);
  const preg = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  const num = (s: string) => Number(s.replace(',', '.'));
  // Weeks at birth from the HPHT and the birth date; the mother can correct it.
  const autoWeeks =
    preg.data && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? Math.floor((new Date(`${date}T00:00:00`).getTime() - new Date(`${preg.data.hpht}T00:00:00`).getTime()) / (7 * 86400000))
      : null;
  const weeks = weeksIn ?? (autoWeeks !== null ? String(autoWeeks) : '');
  const premature = num(weeks) > 0 && num(weeks) < 37;
  const outsideCare = attendant === 'dukun' || attendant === 'family' || attendant === 'none' || place === 'home' || place === 'on_the_way';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`/api/pregnancies/${id}/birth`, {
        body: {
          birth_date: date,
          name: name.trim(),
          sex,
          birth_weight_kg: num(weight),
          birth_length_cm: num(length),
          birth_place: place,
          birth_attendant: attendant,
          gestational_weeks: num(weeks) || null,
        },
      }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const c = result.child;
    return (
      <Screen key="result0">
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
              <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                {result.low_birth_weight && <StatusPill status="action" label="BBLR" />}
                {result.premature && <StatusPill status="action" label={`${t('prematureLbl')} · ${result.gestational_weeks} ${t('weeksWord')}`} />}
                {!result.low_birth_weight && !result.premature && <StatusPill status="ok" label={t('childCreated')} />}
              </Row>
            </View>
          </Row>
          {result.low_birth_weight && <Text style={{ marginTop: 10, color: statusColor.action.fg }}>{t('lowBirthWeight')}</Text>}
          {result.premature && <Text style={{ marginTop: 6, color: statusColor.action.fg }}>{t('prematureTip')}</Text>}
          {outsideCare && <Text style={{ marginTop: 6, color: statusColor.action.fg }}>{t('kn1Tip')}</Text>}
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
      <StepDots total={4} current={step - 1} label={`${t('step')} ${step} ${t('of')} 4`} />

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
            <Field label={`⚖️ ${t('birthWeightKg')}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={`${t('eg')} 3.0`} />
            <Field label={`📏 ${t('birthLengthCm')}`} value={length} onChangeText={setLength} keyboardType="decimal-pad" placeholder={`${t('eg')} 49`} />
            <Field
              label={`🤰 ${t('weeksAtBirth')}`}
              value={weeks}
              onChangeText={setWeeksIn}
              keyboardType="decimal-pad"
              hint={premature ? t('prematureHint') : t('weeksAtBirthHint')}
              error={null}
            />
            {premature && <StatusPill status="action" label={`${t('prematureLbl')} (< 37 ${t('weeksWord')})`} />}
          </Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" disabled={!weight || !length || !weeks} onPress={() => setStep(3)} />
            </View>
          </Row>
        </>
      )}

      {step === 3 && (
        <>
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 8 }}>🏥 {t('bornWhere')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {BIRTH_PLACES_DONE.map((b) => (
                <Chip key={b.key} emoji={b.emoji} label={b.label[lang]} selected={place === b.key} onPress={() => setPlace(b.key)} />
              ))}
            </View>
          </Card>
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 8 }}>👩‍⚕️ {t('helperLbl')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {BIRTH_ATTENDANTS.map((b) => (
                <Chip key={b.key} emoji={b.emoji} label={b.label[lang]} selected={attendant === b.key} onPress={() => setAttendant(b.key)} />
              ))}
            </View>
          </Card>
          {outsideCare && (
            <Card tint={tones.orange.bg}>
              <Text style={{ color: statusColor.action.fg, fontWeight: '700' }}>{t('kn1Tip')}</Text>
            </Card>
          )}
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(2)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" disabled={!place || !attendant} onPress={() => setStep(4)} />
            </View>
          </Row>
        </>
      )}

      {step === 4 && (
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
              { icon: 'time' as const, tone: premature ? ('orange' as const) : ('green' as const), value: `${weeks} ${t('weeksWord')}`, label: t('weeksAtBirth') },
              { icon: 'business' as const, tone: 'blue' as const, value: label(BIRTH_PLACES_DONE, place, lang), label: t('bornWhere') },
              { icon: 'medkit' as const, tone: 'pink' as const, value: label(BIRTH_ATTENDANTS, attendant, lang), label: t('helperLbl') },
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
          {(num(weight) > 0 && num(weight) < 2.5) || premature ? (
            <Card tint={tones.orange.bg}>
              {num(weight) > 0 && num(weight) < 2.5 && <Text style={{ color: statusColor.action.fg, fontWeight: '700' }}>{t('lowBirthWeight')}</Text>}
              {premature && <Text style={{ color: statusColor.action.fg, fontWeight: '700' }}>{t('prematureTip')}</Text>}
            </Card>
          ) : null}
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
