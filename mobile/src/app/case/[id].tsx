import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';

import { AssessmentView } from '../../components/AssessmentView';
import { Badge, Button, Card, Chip, ErrorBox, Field, H2, Loading, P, Row, Screen, Segmented, StatusPill, Toggle } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/fun';
import { PRIORITY_STATUS } from '../../lib/status';
import type { CaseItem, RiskLevel, SupplyRequest } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, statusColor } from '../../theme';
import { Text } from '../../components/Text';

const STATUSES = ['open', 'in_progress', 'referred', 'resolved', 'closed'] as const;

export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, user } = useAuth();
  const kase = useApi<CaseItem>(`/api/cases/${id}`);
  const supplies = useApi<SupplyRequest[]>(kase.data ? `/api/supply-requests?child_id=${kase.data.child_id}` : null);
  const [note, setNote] = useState('');
  const [share, setShare] = useState(false);
  const [reviewLevel, setReviewLevel] = useState<RiskLevel | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = kase.data;
  if (!c) return <Screen>{kase.error ? <ErrorBox message={kase.error} /> : <Loading />}</Screen>;
  const a = c.assessment;
  const staff = !!user && user.role !== 'caregiver';
  // Kaders can confirm or raise a result; only a doctor/officer can lower a high one.
  const kaderLocked = user?.role === 'kader' && a?.risk_level === 'high';
  const levels: RiskLevel[] = kaderLocked ? ['high'] : ['low', 'medium', 'high'];

  const update = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      kase.setData(await api<CaseItem>(`/api/cases/${id}`, { method: 'PATCH', body }));
      setNote('');
      setShare(false);
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
      <Stack.Screen options={{ title: c.child_name }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>{c.child_name}</Text>
          <StatusPill status={PRIORITY_STATUS[c.priority]} label={t(`prio_${c.priority}`)} />
        </Row>
        <P muted>
          {c.region?.name} · {formatDate(c.created_at, lang)}
        </P>
        {/* The two things done most from a case: call the family, open the child; then set the status. */}
        <Row style={{ gap: 8 }}>
          {c.family?.phone ? (
            <View style={{ flex: 1 }}>
              <Button small icon="call" title={t('callFamily')} onPress={() => Linking.openURL(`tel:${c.family!.phone}`)} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button small variant="secondary" title={t('childProfile')} icon="person-outline" onPress={() => router.push(`/child/${c.child_id}`)} />
          </View>
        </Row>
        <Text style={{ fontWeight: '700', marginTop: 10, marginBottom: 6 }}>{t('caseStatus')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Chip key={s} label={t(`cstatus_${s}`)} selected={c.status === s} onPress={() => update({ status: s })} />
          ))}
        </View>
      </Card>

      {a && <AssessmentView a={a} />}

      {a && staff && (
        <Card style={{ borderColor: colors.accent }}>
          <H2 emoji="🔎">{t('review')}</H2>
          {a.reviewed_at && (
            <P muted style={{ fontSize: 13 }}>
              ✓ {t('lastReviewed')}: {a.reviewed_by_name ?? ''} · {formatDate(a.reviewed_at, lang)}
            </P>
          )}
          <Segmented<RiskLevel>
            value={reviewLevel ?? a.risk_level}
            onChange={setReviewLevel}
            options={levels.map((l) => ({ value: l, label: t(`risk_${l}`) }))}
          />
          {kaderLocked && <P muted style={{ fontSize: 13 }}>ℹ️ {t('kaderCannotLower')}</P>}
          <Field label={t('reviewNote')} value={reviewNote} onChangeText={setReviewNote} multiline />
          <Button title={t('save')} onPress={review} loading={busy} />
        </Card>
      )}

      <Card>
        <H2>{t('caseNotes')}</H2>
        {c.notes.map((n) => (
          <View key={n.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingVertical: 6 }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>
              {n.author} <Text style={{ color: colors.muted, fontWeight: '400' }}>({n.author_role}) · {formatDate(n.created_at, lang)}</Text>
            </Text>
            <P>{n.text}</P>
            {n.visible_to_caregiver && <StatusPill status="info" label={`👪 ${t('sharedWithFamily')}`} />}
          </View>
        ))}
        <Field label={t('addNote')} value={note} onChangeText={setNote} multiline />
        <Toggle label={`👪 ${t('shareWithFamily')}`} value={share} onChange={setShare} />
        {share && <Text style={{ color: statusColor.info.fg, fontSize: 13, marginBottom: 6 }}>{t('shareWithFamilyHint')}</Text>}
        <Button small title={t('addNote')} onPress={() => update({ note, share_with_family: share })} disabled={!note.trim()} loading={busy} />
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
