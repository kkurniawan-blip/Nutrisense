import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ExamCard, FacilityLinkCard, LinkCodeSheet, useExamSeen } from '../../../components/FacilityLink';
import { SyncBanner } from '../../../components/SyncBanner';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, Empty, ErrorBox, Loading, Row, Screen, Section } from '../../../components/ui';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import type { FacilityLink, Pregnancy } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, radius, statusColor, tones } from '../../../theme';

/** Hasil dari Puskesmas: every check-up the facility sent, newest first, and (for the mother) her code and the switch-off. */
export default function FacilityResults() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, user } = useAuth();
  const q = useApi<Pregnancy>(`/api/pregnancies/${id}`);
  const link = useApi<FacilityLink>(`/api/pregnancies/${id}/link`);
  const { markSeen } = useExamSeen(id, link.data?.exams[0]);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offDone, setOffDone] = useState(false);

  // Opening the results counts as having seen the newest one.
  useEffect(() => {
    if (link.data?.exams.length) markSeen();
  }, [link.data, markSeen]);

  const p = q.data;
  const l = link.data;
  if (!l || !p)
    return (
      <Screen>
        {link.error || q.error ? <ErrorBox message={t('flNothingCached')} onRetry={() => [link.reload(), q.reload()]} /> : <Loading />}
      </Screen>
    );

  const mother = user?.id === p.mother_id;
  const [latest, ...earlier] = l.exams;

  const switchOff = async () => {
    setBusy(true);
    setError(null);
    try {
      link.setData(await api<FacilityLink>(`/api/pregnancies/${id}/link`, { body: { enabled: false } }));
      setConfirm(false);
      setOffDone(true);
      void q.reload();
    } catch (e) {
      setError(e instanceof NetworkError ? t('flNoSignalOff') : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={link.loading} onRefresh={() => [link.reload(), q.reload()]}>
      <SyncBanner stale={link.stale} />
      {offDone && <Bubble mood="caring">{t('flOffDone')}</Bubble>}

      {/* Her code at the top, ready to show at the desk */}
      {mother && l.enabled && l.code && (
        <View style={{ backgroundColor: tones.lavender.bg, borderRadius: radius.lg, padding: 14, marginBottom: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.primaryDark, fontWeight: '600', fontSize: 14 }}>{t('flCodeLabel')}</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: colors.primaryDark, letterSpacing: 2 }} adjustsFontSizeToFit numberOfLines={1}>
                {l.code}
              </Text>
            </View>
            <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={t('flShowQr')} style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '800', color: colors.primaryDark }}>▦ QR</Text>
            </Pressable>
          </Row>
          <LinkCodeSheet code={l.code} facility={l.facility} visible={sheet} onClose={() => setSheet(false)} />
        </View>
      )}

      {/* Not connected: the mother can connect here; staff see who can */}
      {!l.enabled && <FacilityLinkCard p={p} link={l} onChanged={(x) => link.setData(x)} />}

      {latest ? (
        <>
          <Section title={l.enabled ? t('flLatest') : t('flOldResults')} />
          <ExamCard key={latest.id} e={latest} prev={earlier[0]} latest={l.enabled} phone={p.facility?.phone} pid={id} startOpen />
          {earlier.length > 0 && <Section title={t('flEarlier')} />}
          {earlier.map((e, i) => (
            <ExamCard key={e.id} e={e} prev={earlier[i + 1]} phone={p.facility?.phone} pid={id} />
          ))}
        </>
      ) : l.enabled ? (
        <Card>
          <Empty text={t('flNoneYet')} />
          {mother && l.code ? <Button variant="secondary" icon="qr-code" title={t('flShowQr')} onPress={() => setSheet(true)} /> : null}
        </Card>
      ) : null}

      {/* Switching off: hers alone, confirmed, explained */}
      {mother && l.enabled && (
        <View style={{ marginTop: 12 }}>
          {!confirm ? (
            <>
              <Button small variant="ghost" title={t('flOffBtn')} onPress={() => setConfirm(true)} />
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>{t('flOffKeep')}</Text>
            </>
          ) : (
            <Card tint={colors.dangerSoft}>
              <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 6 }}>{t('flOffConfirm')}</Text>
              {[t('flOffP1'), t('flOffKeep'), t('flOffP3')].map((x) => (
                <Text key={x} style={{ fontSize: 14, lineHeight: 21 }}>
                  • {x}
                </Text>
              ))}
              {error && <ErrorBox message={error} />}
              <Row style={{ marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                  <Button small variant="danger" title={t('flOffYes')} loading={busy} onPress={switchOff} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button small variant="ghost" title={t('cancel')} onPress={() => setConfirm(false)} />
                </View>
              </Row>
            </Card>
          )}
        </View>
      )}
      {!mother && !l.enabled && !latest && <Text style={{ color: statusColor.unknown.fg, textAlign: 'center' }}>{t('flNotLinked')}</Text>}
    </Screen>
  );
}
