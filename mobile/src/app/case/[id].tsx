import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { AssessmentView } from '../../components/AssessmentView';
import { Badge, Button, Card, Chip, ErrorBox, Field, H2, Loading, P, Row, Screen, Segmented } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { isOversight, useAuth } from '../../lib/auth';
import type { CaseItem, RiskLevel, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

const STATUSES = ['open', 'in_progress', 'referred', 'resolved', 'closed'] as const;

export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, user } = useAuth();
  const kase = useApi<CaseItem>(`/api/cases/${id}`);
  const supplies = useApi<SupplyRequest[]>(kase.data ? `/api/supply-requests?child_id=${kase.data.child_id}` : null);
  const [note, setNote] = useState('');
  const [reviewLevel, setReviewLevel] = useState<RiskLevel | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = kase.data;
  if (!c) return <Screen>{kase.error ? <ErrorBox message={kase.error} /> : <Loading />}</Screen>;
  const a = c.assessment;

  const update = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      kase.setData(await api<CaseItem>(`/api/cases/${id}`, { method: 'PATCH', body }));
      setNote('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (!a) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/assessments/${a.id}/review`, { body: { reviewed_level: reviewLevel ?? a.risk_level, note: reviewNote } });
      await kase.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={kase.loading} onRefresh={kase.reload}>
      <Stack.Screen options={{ title: `#${c.id} ${c.child_name}` }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>{c.child_name}</Text>
          <Badge text={c.priority.toUpperCase()} fg="#fff" bg={c.priority === 'low' ? colors.muted : c.priority === 'medium' ? colors.warn : colors.danger} />
        </Row>
        <P muted>
          {c.region?.name} · {new Date(c.created_at).toLocaleString()}
        </P>
        <Button small variant="ghost" title={t('open')} icon="person-outline" onPress={() => router.push(`/child/${c.child_id}`)} />
      </Card>

      {a && <AssessmentView a={a} />}

      {a && isOversight(user) && (
        <Card style={{ borderColor: colors.accent }}>
          <H2>{t('review')}</H2>
          <Segmented<RiskLevel>
            value={reviewLevel ?? a.risk_level}
            onChange={setReviewLevel}
            options={[
              { value: 'low', label: t('risk_low') },
              { value: 'medium', label: t('risk_medium') },
              { value: 'high', label: t('risk_high') },
            ]}
          />
          <Field label={t('reviewNote')} value={reviewNote} onChangeText={setReviewNote} multiline />
          <Button title={t('save')} onPress={review} loading={busy} />
        </Card>
      )}

      <Card>
        <H2>{t('caseStatus')}</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Chip key={s} label={s} selected={c.status === s} onPress={() => update({ status: s })} />
          ))}
        </View>
        {c.notes.map((n) => (
          <View key={n.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingVertical: 6 }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>
              {n.author} <Text style={{ color: colors.muted, fontWeight: '400' }}>({n.author_role}) · {new Date(n.created_at).toLocaleString()}</Text>
            </Text>
            <P>{n.text}</P>
          </View>
        ))}
        <Field label={t('addNote')} value={note} onChangeText={setNote} multiline />
        <Button small title={t('addNote')} onPress={() => update({ note })} disabled={!note.trim()} loading={busy} />
      </Card>

      <Card>
        <H2>{t('supplyRequests')}</H2>
        {(supplies.data ?? []).map((r) => (
          <Card key={r.id} onPress={() => router.push(`/supply/${r.id}`)} style={{ padding: 10, marginBottom: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text, flex: 1 }}>{r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</Text>
              <Badge text={t(`status_${r.status}`)} fg={colors.info} bg={colors.infoSoft} />
            </Row>
          </Card>
        ))}
      </Card>
      {error && <ErrorBox message={error} />}
    </Screen>
  );
}
