import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { Bubble, Button, Card, Chip, ErrorBox, Field, P, Screen, Segmented, Toggle } from '../../components/ui';
import { api, ApiError, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Child, Region } from '../../lib/types';

export default function NewChild() {
  const { user, t } = useAuth();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('female');
  const [birthDate, setBirthDate] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  // Staff find the mother's account by phone (what most mothers in the villages sign up with) or by email.
  const [via, setVia] = useState<'phone' | 'email'>('phone');
  const [caregiverEmail, setCaregiverEmail] = useState('');
  const [caregiverPhone, setCaregiverPhone] = useState('');
  const [water, setWater] = useState(true);
  const [sanitation, setSanitation] = useState(true);
  const [regions, setRegions] = useState<Region[]>([]);
  // The user's own village until another is picked (the user can load after the first render on web).
  const [regionPick, setRegionId] = useState<number | null>(null);
  const regionId = regionPick ?? user?.region_id ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Region[]>('/api/regions').then(setRegions).catch(() => undefined);
  }, []);

  const staff = user?.role !== 'caregiver';
  const contact = via === 'phone' ? caregiverPhone.trim() : caregiverEmail.trim();

  /** The server's reasons in plain words for the Kader, instead of its English message. */
  const explain = (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 404) return t('caregiverNotFound');
      if (e.status === 409) return t('caregiverNotYours');
      if (e.status === 403 && /consent/i.test(e.message)) return t('caregiverNoConsent');
      if (e.status === 400 && /month/i.test(e.message)) return t('childAgeRange');
    }
    return errorText(e);
  };

  const submit = async () => {
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setError(t('required'));
      return;
    }
    if (staff && !contact) {
      setError(t('caregiverNeeded'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const child = await api<Child>('/api/children', {
        body: {
          name,
          sex,
          birth_date: birthDate,
          region_id: regionId,
          birth_weight_kg: birthWeight ? Number(birthWeight.replace(',', '.')) : null,
          clean_water_access: water,
          sanitation_access: sanitation,
          caregiver_email: staff && via === 'email' ? contact : null,
          caregiver_phone: staff && via === 'phone' ? contact : null,
        },
      });
      router.replace(`/child/${child.id}/measure`);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const visibleRegions = user?.role === 'kader' ? regions.filter((r) => user.covered_region_ids.includes(r.id)) : regions;

  return (
    <Screen>
      <Bubble mood="cheer">{t('addFirstChild')}</Bubble>
      <Card>
        {staff && (
          <>
            <P muted>{t('caregiverAccount')}</P>
            <Segmented
              value={via}
              onChange={setVia}
              options={[
                { value: 'phone', label: `📱 ${t('phoneLbl')}` },
                { value: 'email', label: `✉️ ${t('email')}` },
              ]}
            />
            {via === 'phone' ? (
              <Field
                label={t('caregiverPhone')}
                value={caregiverPhone}
                onChangeText={setCaregiverPhone}
                keyboardType="phone-pad"
                placeholder={`${t('eg')} 0812 3456 7890`}
                hint={t('caregiverPhoneHint')}
              />
            ) : (
              <Field label={t('caregiverEmail')} value={caregiverEmail} onChangeText={setCaregiverEmail} autoCapitalize="none" keyboardType="email-address" />
            )}
          </>
        )}
        <Field label={t('name')} value={name} onChangeText={setName} />
        <P muted>{t('sex')}</P>
        <Segmented
          value={sex}
          onChange={setSex}
          options={[
            { value: 'female', label: `👧 ${t('female')}` },
            { value: 'male', label: `👦 ${t('male')}` },
          ]}
        />
        <Field label={t('birthDate')} value={birthDate} onChangeText={setBirthDate} placeholder={`${t('eg')} 2024-05-17`} keyboardType="numbers-and-punctuation" />
        <Field label={t('birthWeight')} value={birthWeight} onChangeText={setBirthWeight} keyboardType="decimal-pad" placeholder={`${t('eg')} 3.1`} />
        <P muted style={{ marginBottom: 6 }}>{t('region')}</P>
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
          {visibleRegions.map((r) => (
            <Chip key={r.id} label={r.name} selected={regionId === r.id} onPress={() => setRegionId(r.id)} />
          ))}
        </Card>
        <Toggle label={`🚰 ${t('cleanWater')}`} value={water} onChange={setWater} />
        <Toggle label={`🚽 ${t('sanitation')}`} value={sanitation} onChange={setSanitation} />
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('save')} onPress={submit} loading={busy} icon="checkmark" />
    </Screen>
  );
}
