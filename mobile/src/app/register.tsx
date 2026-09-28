import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, H2, Loading, PasswordField, Screen, StatusPill, StepDots, Toggle } from '../components/ui';
import { api, ApiError, errorText, NetworkError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Region } from '../lib/types';
import { EMAIL_RE, passwordStrength } from '../lib/validate';
import { colors, radius, statusColor, type StatusKey } from '../theme';

type Consent = { data: boolean; ai: boolean; satusehat: boolean; research: boolean };

const STRENGTH: Record<'weak' | 'ok' | 'strong', { status: StatusKey; width: string }> = {
  weak: { status: 'action', width: '33%' },
  ok: { status: 'monitor', width: '66%' },
  strong: { status: 'ok', width: '100%' },
};

function Progress({ step }: { step: 1 | 2 }) {
  const { t } = useAuth();
  return <StepDots total={2} current={step - 1} label={`${t('step')} ${step} ${t('of')} 2 · ${step === 1 ? t('signUpStep1') : t('signUpStep2')}`} />;
}

/** A consent row: badge, toggle, and one plain sentence on what it is for. */
function ConsentRow({ badge, status, label, why, value, onChange, required }: { badge: string; status: StatusKey; label: string; why: string; value: boolean; onChange: (v: boolean) => void; required?: boolean }) {
  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, marginTop: 6 }}>
      <StatusPill status={status} label={badge} />
      <Toggle label={label} value={value} onChange={onChange} />
      <Text style={{ color: required && !value ? colors.danger : colors.muted, fontSize: 13, lineHeight: 19 }}>{why}</Text>
    </View>
  );
}

export default function Register() {
  const { register, t, lang } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '', phone: '' });
  const [tried, setTried] = useState(false);
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [consent, setConsent] = useState<Consent>({ data: false, ai: true, satusehat: false, research: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Region[]>('/api/regions')
      .then(setRegions)
      .catch((e) => {
        setRegions([]);
        setError(errorText(e));
      });
  }, []);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const strength = passwordStrength(form.password);
  const errors = {
    full_name: form.full_name.trim().length < 2 ? t('nameRequired') : null,
    email: !EMAIL_RE.test(form.email.trim()) ? t('emailInvalid') : null,
    password: form.password.length < 8 ? t('passwordMin') : null,
    confirm: form.confirm !== form.password ? t('passwordMismatch') : null,
  };
  const step1Ok = !Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (tried || (form[k] && k !== 'full_name') ? errors[k] : null);

  const next = () => {
    setTried(true);
    if (step1Ok) {
      setError(null);
      setStep(2);
    }
  };

  const submit = async () => {
    if (!consent.data) {
      setError(t('consentRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || null,
        region_id: regionId,
        language: lang,
        consent_data_processing: consent.data,
        consent_ai_analysis: consent.ai,
        consent_satusehat_sharing: consent.satusehat,
        consent_research_use: consent.research,
      });
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(t('emailTaken'));
        setStep(1);
      } else setError(e instanceof NetworkError ? t('cannotReachServer') : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const districts = [...new Set((regions ?? []).map((r) => r.district))];

  if (step === 1)
    return (
      <Screen>
        <Progress step={1} />
        <Bubble mood="cheer">{t('signUpHello')}</Bubble>
        <Card>
          <Field label={`🙂 ${t('fullName')}`} value={form.full_name} onChangeText={set('full_name')} error={show('full_name')} autoComplete="name" textContentType="name" placeholder="Ibu Maria" />
          <Field
            label={`✉️ ${t('email')}`}
            value={form.email}
            onChangeText={set('email')}
            error={show('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="nama@email.com"
          />
          <Field label={`📱 ${t('phone')}`} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" hint={t('phoneHint')} placeholder="08xx" />
          <PasswordField
            label={`🔑 ${t('password')}`}
            value={form.password}
            onChangeText={set('password')}
            error={show('password')}
            hint={t('passwordHint')}
            autoComplete="new-password"
            textContentType="newPassword"
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
          />
          {strength && (
            <View style={{ marginTop: -8, marginBottom: 12 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
                <View style={{ height: 6, borderRadius: 3, width: STRENGTH[strength].width as `${number}%`, backgroundColor: statusColor[STRENGTH[strength].status].fg }} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: statusColor[STRENGTH[strength].status].fg, marginTop: 4 }}>
                {statusColor[STRENGTH[strength].status].dot} {t(`pw_${strength}`)}
              </Text>
            </View>
          )}
          <PasswordField
            label={`🔑 ${t('confirmPassword')}`}
            value={form.confirm}
            onChangeText={set('confirm')}
            error={show('confirm')}
            autoComplete="new-password"
            textContentType="newPassword"
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
            onSubmitEditing={next}
          />
        </Card>
        {error && <ErrorBox message={error} />}
        <Button title={t('next')} icon="arrow-forward" onPress={next} />
        <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{t('haveAccount')}</Text>
        </Pressable>
      </Screen>
    );

  return (
    <Screen>
      <Progress step={2} />
      <Card>
        <H2 emoji="📍">{t('whereLive')}</H2>
        <Text style={{ color: colors.muted, marginTop: -6, marginBottom: 10, lineHeight: 20 }}>{t('whereLiveSub')}</Text>
        {!regions && <Loading />}
        {districts.map((d) => (
          <View key={d} style={{ marginBottom: 6 }}>
            <Text style={{ fontWeight: '800', fontSize: 13, color: colors.muted, marginBottom: 4 }}>{d}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {regions!
                .filter((r) => r.district === d)
                .map((r) => (
                  <Chip key={r.id} emoji={regionId === r.id ? '✓' : undefined} label={r.name} selected={regionId === r.id} onPress={() => setRegionId(regionId === r.id ? null : r.id)} />
                ))}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <H2 emoji="🔐">{t('consentTitle')}</H2>
        <Text style={{ color: colors.muted, marginTop: -6, lineHeight: 20 }}>{t('consentIntro')}</Text>
        <ConsentRow required badge={t('cat_required')} status="info" label={t('consentData')} why={t('consentDataWhy')} value={consent.data} onChange={(v) => setConsent({ ...consent, data: v })} />
        <ConsentRow badge={t('cat_ai')} status="ai" label={t('consentAI')} why={t('consentAIWhy')} value={consent.ai} onChange={(v) => setConsent({ ...consent, ai: v })} />
        <ConsentRow badge={t('cat_health')} status="ok" label={t('consentSatusehat')} why={t('consentSatusehatWhy')} value={consent.satusehat} onChange={(v) => setConsent({ ...consent, satusehat: v })} />
        <ConsentRow badge={t('cat_optional')} status="unknown" label={t('consentResearch')} why={t('consentResearchWhy')} value={consent.research} onChange={(v) => setConsent({ ...consent, research: v })} />
        <View style={{ backgroundColor: statusColor.info.bg, borderRadius: radius.md, padding: 10, marginTop: 12 }}>
          <Text style={{ color: statusColor.info.fg, fontSize: 13, lineHeight: 19, fontWeight: '700' }}>ℹ️ {t('consentChangeLater')}</Text>
        </View>
      </Card>

      {error && <ErrorBox message={error} />}
      <Button title={t('createAccount')} onPress={submit} loading={busy} disabled={!consent.data} icon="checkmark-circle" />
      <Button title={t('back')} variant="ghost" icon="arrow-back" onPress={() => setStep(1)} />
    </Screen>
  );
}
