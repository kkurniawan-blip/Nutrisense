import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';

import { Escalation, SymptomTile } from '../../../components/SymptomTiles';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, ErrorBox, H2, ListRow, Row, Screen } from '../../../components/ui';
import { errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { saveOrQueue, uuid } from '../../../lib/offline';
import { MOTHER_COMMON, MOTHER_DANGER } from '../../../lib/pregnancy';
import type { Facility, Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, statusColor } from '../../../theme';

/** Tanda bahaya kehamilan: the same layout as the child's symptom check. Any danger sign shows help at once. */
export default function MotherDanger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const q = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSignal, setNoSignal] = useState(false);
  // One key per report, so pressing again without signal never queues (or alerts the Kader) twice.
  const [reportId, setReportId] = useState(() => uuid());
  const [sent, setSent] = useState<{ danger: boolean; signs: string[]; kader: { phone: string | null } | null; facility: Facility | null } | null>(null);
  const kader = q.data?.care_team.find((m) => m.role === 'kader');
  const danger = selected.some((s) => MOTHER_DANGER.some((d) => d.key === s));
  const toggle = (k: string) => {
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
    setReportId(uuid()); // a changed report is a new report
  };

  // Without signal the report waits on the phone and goes out by itself, but a danger sign must not wait for
  // the Kader to see it: the screen also puts the phone numbers in front of her (a call often works without data).
  const report = async () => {
    setBusy(true);
    setError(null);
    setNoSignal(false);
    try {
      const res = await saveOrQueue<NonNullable<typeof sent>>('mother_danger', Number(id), q.data?.mother_name ?? '', `/api/pregnancies/${id}/danger`, {
        signs: selected,
        client_uuid: reportId,
      });
      if (res) setSent(res);
      else setNoSignal(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const facility = q.data?.facility;

  if (sent) {
    const tips = MOTHER_COMMON.filter((c) => sent.signs.includes(c.key));
    return (
      <Screen key="result0">
        {sent.danger && <Escalation phone={sent.kader?.phone ?? kader?.phone} facility={sent.facility ?? q.data?.facility} />}
        <Card tint={sent.danger ? statusColor.info.bg : undefined}>
          <Text style={{ fontWeight: '800', color: sent.danger ? statusColor.info.fg : colors.ok }}>✓ {t('dangerSent')}</Text>
          {sent.danger && <Text style={{ color: statusColor.info.fg }}>{t('kaderTold')}</Text>}
        </Card>
        {tips.length > 0 && (
          <Card>
            <H2>{t('tipsForYou')}</H2>
            {tips.map((c) => (
              <ListRow key={c.key} emoji={c.emoji} title={c.tip[lang]} subtitle={c.label[lang]} right={<View />} />
            ))}
          </Card>
        )}
        <Button title={t('backToPregnancy')} icon="arrow-forward" onPress={() => router.replace(`/pregnancy/${id}`)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Bubble mood="caring" audio={`${t('howMom')} ${t('dangerAudio')}`}>{t('howMom')}</Bubble>
      {danger ? (
        <Escalation phone={kader?.phone} facility={q.data?.facility} />
      ) : (
        <Row style={{ gap: 8, marginBottom: 12 }}>
          {q.data?.facility?.phone ? (
            <View style={{ flex: 1 }}>
              <Button small variant="secondary" icon="call" title={t('callMidwife')} onPress={() => Linking.openURL(`tel:${q.data!.facility!.phone}`)} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button small variant="secondary" icon="medkit" title="119" onPress={() => Linking.openURL('tel:119')} />
          </View>
        </Row>
      )}

      <Card tint={statusColor.urgent.bg}>
        <H2 emoji="🚨">{t('urgentSigns')}</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOTHER_DANGER.map((d) => (
            <SymptomTile key={d.key} danger emoji={d.emoji} label={d.label[lang]} on={selected.includes(d.key)} onPress={() => toggle(d.key)} />
          ))}
        </View>
      </Card>

      <H2 emoji="🤒">{t('commonSymptoms')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MOTHER_COMMON.map((c) => (
          <SymptomTile key={c.key} emoji={c.emoji} label={c.label[lang]} on={selected.includes(c.key)} onPress={() => toggle(c.key)} />
        ))}
      </View>

      {noSignal &&
        (danger ? (
          <Card tint={statusColor.urgent.bg} style={{ borderColor: colors.danger, borderWidth: 2 }}>
            <Text accessibilityLiveRegion="assertive" style={{ color: statusColor.urgent.fg, fontWeight: '900', fontSize: 17 }}>
              📵 {t('dangerNoSignal')}
            </Text>
            <Text style={{ marginTop: 4, marginBottom: 6 }}>{t('dangerNoSignalSub')}</Text>
            <Row style={{ gap: 8, alignItems: 'stretch' }}>
              <View style={{ flex: 1 }}>
                <Button small variant="danger" icon="medical" title="119" onPress={() => Linking.openURL('tel:119')} />
              </View>
              {facility?.phone ? (
                <View style={{ flex: 1 }}>
                  <Button small variant="danger" icon="call" title="Puskesmas" onPress={() => Linking.openURL(`tel:${facility.phone}`)} />
                </View>
              ) : null}
            </Row>
            {kader?.phone ? <Button small variant="secondary" icon="call" title={`${t('call')} Kader ${kader.name}`} onPress={() => Linking.openURL(`tel:${kader.phone}`)} /> : null}
          </Card>
        ) : (
          <ErrorBox message={t('dangerNoSignalCommon')} onRetry={report} />
        ))}
      {error && <ErrorBox message={error} onRetry={report} />}
      <Button title={t('reportLbl')} icon="send" onPress={report} loading={busy} disabled={!selected.length} />
    </Screen>
  );
}
