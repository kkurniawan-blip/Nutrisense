import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Mascot } from '../../components/Mascot';
import { AboutMomCard, gestation, HphtCard, HphtMode } from '../../components/PregnancyForm';
import { Text } from '../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, IconChip, Row, Screen, StepDots, Toggle } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { EDUCATION, label, weeksText } from '../../lib/pregnancy';
import type { Pregnancy, Region, User } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, statusColor, tones } from '../../theme';

/**
 * Tambah ibu hamil (Kader): the mother's name, phone and village; the pregnancy; her consent and a check. She gets an
 * account on her phone number and a temporary password, which the Kader reads to her once.
 */
export default function NewMother() {
  const { t, lang, user } = useAuth();
  const regions = useApi<Region[]>('/api/regions');
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [regionId, setRegionId] = useState<number | null>(user?.region_id ?? null);
  const [mode, setMode] = useState<HphtMode>('weeks');
  const [hpht, setHpht] = useState('');
  const [weeks, setWeeks] = useState('');
  const [height, setHeight] = useState('');
  const [education, setEducation] = useState<string | null>(null);
  const [gravida, setGravida] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mother: User; temp_password: string | null; pregnancy: Pregnancy } | null>(null);
  const { ga, valid, body: gaBody } = gestation(mode, hpht, weeks);
  const mine = (regions.data ?? []).filter((r) => !user?.covered_region_ids.length || user.covered_region_ids.includes(r.id));
  const phoneOk = phone.replace(/\D/g, '').length >= 9;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(
        await api('/api/kader/mothers', {
          body: {
            full_name: name.trim(),
            phone,
            region_id: regionId,
            ...gaBody,
            mother_height_cm: height ? Number(height.replace(',', '.')) : null,
            education,
            gravida,
            consent_given: consent,
          },
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Screen key="result0">
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Mascot size={96} mood="cheer" bounce />
          <Text style={{ fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 6 }}>{t('motherAdded')}</Text>
        </View>
        <Card>
          <Row style={{ gap: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 30 }}>🤰</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>{done.mother.full_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {weeksText(done.pregnancy.gestational_weeks, done.pregnancy.gestational_extra_days, lang)} · {done.pregnancy.region?.name}
              </Text>
            </View>
          </Row>
        </Card>
        {done.temp_password ? (
          <Card tint={tones.lavender.bg}>
            <Text style={{ fontWeight: '800', color: colors.primaryDark }}>🔑 {t('tempPasswordTitle')}</Text>
            <Text style={{ fontSize: 30, fontWeight: '900', letterSpacing: 4, textAlign: 'center', marginVertical: 10 }}>{done.temp_password}</Text>
            <Text style={{ color: colors.text }}>
              {t('tempPasswordHow')} <Text style={{ fontWeight: '800' }}>{done.mother.phone}</Text>
            </Text>
          </Card>
        ) : (
          <Card tint={statusColor.info.bg}>
            <Text style={{ color: statusColor.info.fg, fontWeight: '700' }}>{t('motherHadAccount')}</Text>
          </Card>
        )}
        <Button title={t('openPregnancy')} icon="arrow-forward" onPress={() => router.replace(`/pregnancy/${done.pregnancy.id}`)} />
        <Button title={t('pregnantMothers')} variant="ghost" onPress={() => router.replace('/mothers')} />
      </Screen>
    );

  return (
    <Screen>
      <StepDots total={4} current={step - 1} label={`${t('step')} ${step} ${t('of')} 4`} />

      {step === 1 && (
        <>
          <Bubble mood="happy">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('whoIsMother')}</Text>
          </Bubble>
          <Card>
            <Field label={`🙂 ${t('fullName')}`} value={name} onChangeText={setName} placeholder={`${t('eg')} Ibu Rosa Ndun`} />
            <Field label={`📱 ${t('phoneLbl')}`} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={`${t('eg')} 0812 3456 7890`} hint={t('phoneLoginHint')} />
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>📍 {t('village')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {mine.map((r) => (
                <Chip key={r.id} label={r.name} selected={regionId === r.id} onPress={() => setRegionId(r.id)} />
              ))}
            </View>
          </Card>
          <Button title={t('next')} icon="arrow-forward" disabled={name.trim().length < 2 || !phoneOk || !regionId} onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Bubble mood="cheer">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('hphtQ')}</Text>
          </Bubble>
          <HphtCard mode={mode} setMode={setMode} hpht={hpht} setHpht={setHpht} weeks={weeks} setWeeks={setWeeks} />
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" disabled={!valid} onPress={() => setStep(3)} />
            </View>
          </Row>
        </>
      )}

      {step === 3 && (
        <>
          <AboutMomCard height={height} setHeight={setHeight} education={education} setEducation={setEducation} gravida={gravida} setGravida={setGravida} />
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(2)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" onPress={() => setStep(4)} />
            </View>
          </Row>
        </>
      )}

      {step === 4 && ga && (
        <>
          <Bubble mood="thinking">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('reviewTitle')}</Text>
          </Bubble>
          <Card>
            {[
              { icon: 'person' as const, tone: 'pink' as const, value: name.trim(), label: phone },
              { icon: 'location' as const, tone: 'orange' as const, value: mine.find((r) => r.id === regionId)?.name ?? '–', label: t('village') },
              { icon: 'calendar' as const, tone: 'lavender' as const, value: weeksText(ga.weeks, ga.extra, lang), label: `${t('hplLabel')} ${formatDate(ga.hpl, lang)}` },
              { icon: 'school' as const, tone: 'green' as const, value: education ? label(EDUCATION, education, lang) : '–', label: `${t('educationLbl')}${height ? ` · ${height} cm` : ''}` },
            ].map((r) => (
              <Row key={r.label + r.value} style={{ gap: 14, paddingVertical: 10 }}>
                <IconChip icon={r.icon} tone={r.tone} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900' }}>{r.value}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{r.label}</Text>
                </View>
              </Row>
            ))}
          </Card>
          <Card tint={statusColor.info.bg}>
            <Toggle label={`✅ ${t('motherConsent')}`} value={consent} onChange={setConsent} />
          </Card>
          {error && <ErrorBox message={error} />}
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('edit')} variant="ghost" icon="create-outline" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('save')} icon="checkmark-circle" loading={busy} disabled={!consent} onPress={save} />
            </View>
          </Row>
        </>
      )}
    </Screen>
  );
}
