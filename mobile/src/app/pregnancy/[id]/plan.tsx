import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, Field, Loading, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { BIRTH_HELPERS, BIRTH_PLACES, FUNDING, TRANSPORT } from '../../../lib/pregnancy';
import type { Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

/** Rencana persalinan: where, how to get there, and who comes along. */
export default function BirthPlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  if (!q.data) return <Screen>{q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;
  return <PlanForm key={q.data.id} p={q.data} onSaved={q.setData} />;
}

function PlanForm({ p, onSaved }: { p: Pregnancy; onSaved: (p: Pregnancy) => void }) {
  const { t, lang } = useAuth();
  const [place, setPlace] = useState<string | null>(p.birth_plan.place ?? null);
  const [transport, setTransport] = useState<string | null>(p.birth_plan.transport ?? null);
  const [companion, setCompanion] = useState(p.birth_plan.companion ?? '');
  const [helper, setHelper] = useState<string | null>(p.birth_plan.helper ?? null);
  const [donor, setDonor] = useState(p.birth_plan.blood_donor ?? '');
  const [funding, setFunding] = useState<string | null>(p.birth_plan.funding ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<Pregnancy>(`/api/pregnancies/${p.id}`, {
          method: 'PATCH',
          body: { birth_plan: { place, transport, companion: companion.trim() || null, helper, blood_donor: donor.trim() || null, funding } },
        }));
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Bubble mood="happy" audio>
        {t('planBubble')}
      </Bubble>
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 8 }}>🏥 {t('birthPlace')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {BIRTH_PLACES.map((b) => (
            <Chip key={b.key} emoji={b.emoji} label={b.label[lang]} selected={place === b.key} onPress={() => { setSaved(false); setPlace(place === b.key ? null : b.key); }} />
          ))}
        </View>
      </Card>
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 8 }}>🚑 {t('transportLbl')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {TRANSPORT.map((b) => (
            <Chip key={b.key} emoji={b.emoji} label={b.label[lang]} selected={transport === b.key} onPress={() => { setSaved(false); setTransport(transport === b.key ? null : b.key); }} />
          ))}
        </View>
      </Card>
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 8 }}>👩‍⚕️ {t('helperLbl')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {BIRTH_HELPERS.map((b) => (
            <Chip key={b.key} emoji={b.emoji} label={b.label[lang]} selected={helper === b.key} onPress={() => { setSaved(false); setHelper(helper === b.key ? null : b.key); }} />
          ))}
        </View>
      </Card>
      <Card>
        <Field label={`🤝 ${t('companionLbl')}`} value={companion} onChangeText={(v) => { setSaved(false); setCompanion(v); }} placeholder={t('companionHint')} />
        <Field label={`🩸 ${t('donorLbl')}`} value={donor} onChangeText={(v) => { setSaved(false); setDonor(v); }} placeholder={t('donorHint')} />
      </Card>
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '800', marginBottom: 8 }}>💳 {t('fundingLbl')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {FUNDING.map((b) => (
            <Chip key={b.key} emoji={b.emoji} label={b.label[lang]} selected={funding === b.key} onPress={() => { setSaved(false); setFunding(funding === b.key ? null : b.key); }} />
          ))}
        </View>
      </Card>
      {error && <ErrorBox message={error} />}
      {saved && <Text style={{ color: colors.ok, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>✓ {t('planSaved')}</Text>}
      <Button title={t('save')} icon="checkmark-circle" loading={busy} onPress={save} />
    </Screen>
  );
}
