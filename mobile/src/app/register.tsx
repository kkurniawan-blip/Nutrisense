import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { Button, Card, Chip, ErrorBox, Field, H2, P, Screen, Toggle } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Region } from '../lib/types';

export default function Register() {
  const { register, t, lang } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '' });
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [consent, setConsent] = useState({ data: false, ai: true, satusehat: false, research: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Region[]>('/api/regions').then(setRegions).catch((e) => setError(errorText(e)));
  }, []);

  const submit = async () => {
    if (!form.full_name || !form.email || form.password.length < 8 || !consent.data) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        ...form,
        email: form.email.trim(),
        phone: form.phone || null,
        region_id: regionId,
        language: lang,
        consent_data_processing: consent.data,
        consent_ai_analysis: consent.ai,
        consent_satusehat_sharing: consent.satusehat,
        consent_research_use: consent.research,
      });
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <Screen>
      <Card>
        <Field label={t('fullName')} value={form.full_name} onChangeText={set('full_name')} />
        <Field label={t('email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
        <Field label={`${t('password')} (min. 8)`} value={form.password} onChangeText={set('password')} secureTextEntry />
        <Field label={t('phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <P muted style={{ marginBottom: 6 }}>{t('region')}</P>
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, marginBottom: 0 }}>
          {regions.map((r) => (
            <Chip key={r.id} label={`${r.name} (${r.district})`} selected={regionId === r.id} onPress={() => setRegionId(r.id)} />
          ))}
        </Card>
      </Card>
      <Card>
        <H2>{t('consentTitle')}</H2>
        <Toggle label={t('consentData')} value={consent.data} onChange={(v) => setConsent({ ...consent, data: v })} />
        <Toggle label={t('consentAI')} value={consent.ai} onChange={(v) => setConsent({ ...consent, ai: v })} />
        <Toggle label={t('consentSatusehat')} value={consent.satusehat} onChange={(v) => setConsent({ ...consent, satusehat: v })} />
        <Toggle label={t('consentResearch')} value={consent.research} onChange={(v) => setConsent({ ...consent, research: v })} />
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('register')} onPress={submit} loading={busy} disabled={!consent.data} icon="person-add-outline" />
    </Screen>
  );
}
