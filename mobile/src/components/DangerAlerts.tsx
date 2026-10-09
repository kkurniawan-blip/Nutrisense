import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';

import { api, ApiError, errorText, NetworkError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, timeAgo } from '../lib/fun';
import type { DangerOutcome, OpenDanger, OpenDangerRow, Pregnancy } from '../lib/types';
import { colors, statusColor } from '../theme';
import { Text } from './Text';
import { Button, Card, ErrorBox, Row, StatusPill } from './ui';
import { Icon } from './Icon';

/**
 * One red card per maternal danger report nobody has closed yet, pinned at the top of the staff home. It stays
 * until someone records an outcome on the pregnancy page (not until a notification is read), so a report cannot
 * get lost. Nothing is shown when there is none: an empty "all clear" card would only push the work list down.
 */
export function OpenDangerCards({ rows, error, onRetry }: { rows: OpenDangerRow[] | null; error?: string | null; onRetry?: () => void }) {
  const { t, lang } = useAuth();
  if (error && !rows) return <ErrorBox message={error} onRetry={onRetry} />;
  if (!rows?.length) return null;
  return (
    <View>
      {rows.map((r) => {
        const what = r.sign_labels.length ? r.sign_labels.join(', ') : t('dangerAlertTitle');
        return (
          <Card key={r.report_id} tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }} onPress={() => router.push(`/pregnancy/${r.pregnancy_id}`)}>
            <Row style={{ gap: 10, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 17, fontWeight: '900', color: statusColor.urgent.fg }}>
                  🚨 {r.mother_name} · {what}
                </Text>
                <Text style={{ fontSize: 13, color: colors.text }}>
                  {timeAgo(r.created_at, lang)}
                  {r.region_name ? ` · 📍 ${r.region_name}` : ''}
                </Text>
                <StatusPill status={r.contacted_at ? 'action' : 'urgent'} label={r.contacted_at ? t('dangerContactedPill') : t('dangerNotContactedPill')} />
              </View>
              <Icon name="chevron-forward" size={22} color={statusColor.urgent.fg} accessibilityLabel={t('seeArrow')} />
            </Row>
            {r.mother_phone ? (
              <Button variant="danger" icon="call" title={t('callMother')} onPress={() => Linking.openURL(`tel:${r.mother_phone}`)} />
            ) : (
              <Text style={{ marginTop: 8, fontSize: 13, color: statusColor.urgent.fg }}>{t('noMotherPhone')}</Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const OUTCOMES: DangerOutcome[] = ['went_to_facility', 'advised_home', 'not_reached'];

/**
 * Staff view of an open danger report, at the top of the pregnancy page: what she reported and when, a call
 * button, then "Sudah saya hubungi" and one of three outcomes. An outcome closes the alert, so each asks first;
 * "Tidak bisa dihubungi" is only a logged attempt and keeps the alert open (a mother nobody reached stays urgent).
 * Online only: the offline outbox replays POSTs, and this is a PATCH. The call itself works without data, and
 * the error says to record it once there is signal.
 */
export function DangerFollowUpCard({ p, onSaved }: { p: Pregnancy; onSaved: (res: { open_danger: OpenDanger | null; outcome: DangerOutcome | null; attempt?: 'not_reached' }) => void }) {
  const { t, lang } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DangerOutcome | null>(null);
  const [notReached, setNotReached] = useState(false);
  const d = p.open_danger;
  if (!d) return null;
  const phone = p.care_team.find((m) => m.role === 'mother')?.phone;

  const send = async (body: { action: 'contacted' } | { outcome: DangerOutcome }, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await api<{ open_danger: OpenDanger | null; outcome: DangerOutcome | null; attempt?: 'not_reached' }>(`/api/pregnancies/${p.id}/danger/${d.id}`, { method: 'PATCH', body });
      setNotReached(res.attempt === 'not_reached');
      onSaved(res);
      setPending(null);
    } catch (e) {
      setError(e instanceof NetworkError ? t('dangerNeedsSignal') : e instanceof ApiError && e.status === 409 ? t('dangerOutcomeTaken') : errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: statusColor.urgent.fg }}>🚨 {t('dangerAlertTitle')}</Text>
      <Text style={{ fontSize: 19, fontWeight: '900', color: statusColor.urgent.fg, marginTop: 2 }}>{d.sign_labels.join(', ')}</Text>
      <Text style={{ fontSize: 13, color: colors.text, marginTop: 2 }}>
        {timeAgo(d.created_at, lang)} · {formatDate(d.created_at, lang, true)}
      </Text>
      <View style={{ marginTop: 8 }}>
        <StatusPill
          status={d.contacted_at ? 'action' : 'urgent'}
          label={
            d.contacted_at
              ? `${d.contacted_by_name ? `${t('dangerContactedBy')} ${d.contacted_by_name}` : t('dangerContactedPill')} · ${timeAgo(d.contacted_at, lang)}`
              : t('dangerNotContactedPill')
          }
        />
      </View>
      {phone ? (
        <Button variant="danger" icon="call" title={t('callMother')} onPress={() => Linking.openURL(`tel:${phone}`)} />
      ) : (
        <Text style={{ marginTop: 8, fontSize: 13, color: statusColor.urgent.fg }}>{t('noMotherPhone')}</Text>
      )}
      {!d.contacted_at && (
        <Button variant="secondary" icon="checkmark" title={t('dangerMarkContacted')} loading={busy === 'contacted'} disabled={!!busy} onPress={() => void send({ action: 'contacted' }, 'contacted')} />
      )}
      <Text style={{ fontWeight: '800', marginTop: 10, marginBottom: 2 }}>{t('dangerOutcomeAsk')}</Text>
      {OUTCOMES.map((o) =>
        pending === o ? (
          <Card key={o} style={{ marginTop: 6, marginBottom: 4 }}>
            <Text style={{ fontWeight: '800' }}>{t(`outcome_${o}`)}</Text>
            <Text style={{ fontSize: 14, marginTop: 2 }}>{t(o === 'not_reached' ? 'dangerNotReachedConfirm' : 'dangerOutcomeConfirm')}</Text>
            <Row style={{ gap: 8, alignItems: 'stretch' }}>
              <View style={{ flex: 1 }}>
                <Button small title={t('dangerYesRecord')} icon="checkmark" loading={busy === o} disabled={!!busy && busy !== o} onPress={() => void send({ outcome: o }, o)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button small variant="ghost" title={t('cancel')} disabled={busy === o} onPress={() => setPending(null)} />
              </View>
            </Row>
          </Card>
        ) : (
          <Button key={o} small variant="ghost" title={t(`outcome_${o}`)} disabled={!!busy} onPress={() => setPending(o)} />
        ),
      )}
      {notReached && <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '700', color: statusColor.urgent.fg }}>{t('dangerNotReachedSaved')}</Text>}
      {error && <ErrorBox message={error} />}
    </Card>
  );
}
