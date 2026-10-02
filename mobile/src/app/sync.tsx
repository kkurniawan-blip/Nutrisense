import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Text } from '../components/Text';
import { Bubble, Button, Card, H2, ListRow, Row, Screen, StatusPill } from '../components/ui';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { history, OutboxItem, OutboxKind, queued, SyncHistoryItem } from '../lib/offline';
import { useSync } from '../lib/sync';
import { colors } from '../theme';

// Keyed by string, not OutboxKind, so a new outbox kind shows a generic row here instead of breaking the build.
const KIND: Record<string, { emoji: string; id: string; en: string }> = {
  measurement: { emoji: '📏', id: 'Pengukuran anak', en: 'Child measurement' },
  meal: { emoji: '🍽️', id: 'Catatan makan', en: 'Meal' },
  symptom: { emoji: '🤒', id: 'Gejala', en: 'Symptoms' },
  mother_measurement: { emoji: '🤰', id: 'Catat ibu (LiLA/Hb)', en: 'Mother check (LiLA/Hb)' },
  anc: { emoji: '📅', id: 'Periksa hamil', en: 'Antenatal visit' },
  daily: { emoji: '💊', id: 'TTD & PMT', en: 'Iron & food supplement' },
  asi: { emoji: '🤱', id: 'ASI', en: 'Breastfeeding' },
  kia: { emoji: '💉', id: 'Jadwal KIA', en: 'KIA schedule' },
  mother_danger: { emoji: '🚨', id: 'Tanda bahaya ibu', en: 'Pregnancy danger sign' },
};
const kindOf = (k: OutboxKind) => KIND[k] ?? { emoji: '📝', id: 'Catatan', en: 'Entry' };

/** Status sinkron: what is waiting on the phone, what reached the server and what the server refused. */
export default function SyncStatus() {
  const { t, lang } = useAuth();
  const { pending, syncing, offline, syncNow } = useSync();
  const [waiting, setWaiting] = useState<OutboxItem[]>([]);
  const [done, setDone] = useState<SyncHistoryItem[]>([]);
  const load = useCallback(() => {
    void queued().then(setWaiting);
    void history().then(setDone);
  }, []);
  useFocusEffect(load);
  const run = async () => {
    // With no signal syncNow can reject; the lists must still refresh and the error must not crash the screen.
    try {
      await syncNow();
    } catch {
      // The items stay in "Menunggu" and the connection pill already says offline.
    } finally {
      load();
    }
  };
  const when = (iso: string) => formatDate(iso, lang, true);

  return (
    <Screen>
      <Bubble mood={pending ? 'thinking' : 'cheer'} audio>
        {pending ? `${pending} ${t('pendingSync')}. ${t('willSyncAuto')}` : t('allSynced')}
      </Bubble>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '800' }}>{t('connection')}</Text>
          <StatusPill status={offline ? 'monitor' : 'ok'} label={offline ? t('offlineNow') : t('onlineNow')} />
        </Row>
        <Button title={t('syncNow')} icon="cloud-upload" loading={syncing} disabled={!pending} onPress={() => void run()} />
      </Card>

      <H2 emoji="📶">{`${t('waitingLbl')} (${waiting.length})`}</H2>
      <Card>
        {waiting.length === 0 && <Text style={{ color: colors.muted }}>{t('nothingWaiting')}</Text>}
        {waiting.map((i) => (
          <ListRow
            key={i.client_uuid}
            emoji={kindOf(i.kind).emoji}
            title={`${kindOf(i.kind)[lang]} · ${i.child_name}`}
            subtitle={`${t('savedOnPhoneAt')} ${when(i.queued_at)}`}
            right={<StatusPill status="info" label={t('waitingLbl')} />}
          />
        ))}
      </Card>

      <H2 emoji="✅">{t('recentlySynced')}</H2>
      <Card>
        {done.length === 0 && <Text style={{ color: colors.muted }}>{t('nothingYet')}</Text>}
        {done.slice(0, 15).map((i, n) => (
          <View key={`${i.done_at}${n}`}>
            <ListRow
              emoji={kindOf(i.kind).emoji}
              title={`${kindOf(i.kind)[lang]} · ${i.child_name}`}
              subtitle={i.status === 'rejected' && i.error ? i.error : when(i.done_at)}
              right={<StatusPill status={i.status === 'sent' ? 'ok' : 'urgent'} label={i.status === 'sent' ? t('sentLbl') : t('rejectedLbl')} />}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
