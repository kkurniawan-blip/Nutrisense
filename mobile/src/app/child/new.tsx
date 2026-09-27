import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { Button, Card, Chip, ErrorBox, Field, P, Screen, Segmented, Toggle } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Child, Region } from '../../lib/types';

export default function NewChild() {
  const { user, t } = useAuth();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('female');
  const [birthDate, setBirthDate] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [caregiverEmail, setCaregiverEmail] = useState('');
  const [water, setWater] = useState(true);
  const [sanitation, setSanitation] = useState(true);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<number | null>(user?.region_id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Region[]>('/api/regions').then(setRegions).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setError(t('required'));
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
          caregiver_email: user?.role === 'caregiver' ? null : caregiverEmail.trim() || null,
        },
      });
      router.replace(`/child/${child.id}/measure`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const visibleRegions = user?.role === 'kader' ? regions.filter((r) => user.covered_region_ids.includes(r.id)) : regions;

  return (
    <Screen>
      <Card>
        {user?.role !== 'caregiver' && (
          <Field label={t('caregiverEmail')} value={caregiverEmail} onChangeText={setCaregiverEmail} autoCapitalize="none" keyboardType="email-address" />
        )}
        <Field label={t('name')} value={name} onChangeText={setName} />
        <P muted>{t('sex')}</P>
        <Segmented
          value={sex}
          onChange={setSex}
          options={[
            { value: 'female', label: t('female') },
            { value: 'male', label: t('male') },
          ]}
        />
        <Field label={t('birthDate')} value={birthDate} onChangeText={setBirthDate} placeholder="2024-05-17" keyboardType="numbers-and-punctuation" />
        <Field label={t('birthWeight')} value={birthWeight} onChangeText={setBirthWeight} keyboardType="decimal-pad" placeholder="3.1" />
        <P muted style={{ marginBottom: 6 }}>{t('region')}</P>
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
          {visibleRegions.map((r) => (
            <Chip key={r.id} label={r.name} selected={regionId === r.id} onPress={() => setRegionId(r.id)} />
          ))}
        </Card>
        <Toggle label={t('cleanWater')} value={water} onChange={setWater} />
        <Toggle label={t('sanitation')} value={sanitation} onChange={setSanitation} />
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('save')} onPress={submit} loading={busy} icon="checkmark" />
    </Screen>
  );
}
