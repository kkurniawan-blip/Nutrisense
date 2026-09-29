import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Escalation, SymptomTile } from '../../../components/SymptomTiles';
import { Text } from '../../../components/Text';
import { Bubble, Button, Card, ErrorBox, H2, ListRow, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { MOTHER_COMMON, MOTHER_DANGER } from '../../../lib/pregnancy';
import type { Pregnancy } from '../../../lib/types';
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
  const [sent, setSent] = useState<{ danger: boolean; signs: string[]; kader: { phone: string | null } | null } | null>(null);
  const kader = q.data?.care_team.find((m) => m.role === 'kader');
  const danger = selected.some((s) => MOTHER_DANGER.some((d) => d.key === s));
  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const report = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await api(`/api/pregnancies/${id}/danger`, { body: { signs: selected } }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    const tips = MOTHER_COMMON.filter((c) => sent.signs.includes(c.key));
    return (
      <Screen>
        {sent.danger && <Escalation phone={sent.kader?.phone ?? kader?.phone} />}
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
      <Bubble mood="caring">{t('howMom')}</Bubble>
      {danger && <Escalation phone={kader?.phone} />}

      <H2 emoji="🤒">{t('commonSymptoms')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MOTHER_COMMON.map((c) => (
          <SymptomTile key={c.key} emoji={c.emoji} label={c.label[lang]} on={selected.includes(c.key)} onPress={() => toggle(c.key)} />
        ))}
      </View>

      <Card tint={statusColor.urgent.bg}>
        <H2 emoji="🚨">{t('urgentSigns')}</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOTHER_DANGER.map((d) => (
            <SymptomTile key={d.key} danger emoji={d.emoji} label={d.label[lang]} on={selected.includes(d.key)} onPress={() => toggle(d.key)} />
          ))}
        </View>
      </Card>

      {error && <ErrorBox message={error} />}
      <Button title={t('reportLbl')} icon="send" onPress={report} loading={busy} disabled={!selected.length} />
    </Screen>
  );
}
