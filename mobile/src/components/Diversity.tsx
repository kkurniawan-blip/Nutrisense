import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { FOOD_GROUPS, GROUP_PLAIN } from '../lib/fun';
import { colors, radius, statusColor } from '../theme';
import { Text } from './Text';
import { RainbowPlate, Row, StatusPill } from './ui';

/** Rainbow plate made explicit: what's done (✓), what's missing, and one small next target. */
export function DiversityCard({ groups, compact }: { groups: string[]; compact?: boolean }) {
  const { t, lang } = useAuth();
  const done = FOOD_GROUPS.filter((g) => groups.includes(g.key));
  const missing = FOOD_GROUPS.filter((g) => !groups.includes(g.key) && g.key !== 'breast_milk');
  const n = done.length;
  const state = n >= 5 ? 'ok' : n >= 3 ? 'monitor' : 'action';
  return (
    <View>
      <Row style={{ gap: 14 }}>
        <RainbowPlate groups={groups} size={compact ? 64 : 80} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>🌈 {t('diversityTitle')}</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', marginVertical: 2 }}>
            {n} / 8 {t('groupsToday')}
          </Text>
          <StatusPill status={state} label={n >= 5 ? t('diversityGood') : t('diversityMore')} />
        </View>
      </Row>
      {!compact && done.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {done.map((g) => (
            <View key={g.key} style={{ backgroundColor: statusColor.ok.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: statusColor.ok.fg, fontWeight: '800', fontSize: 13 }}>
                ✓ {g.emoji} {GROUP_PLAIN[g.key][lang]}
              </Text>
            </View>
          ))}
        </View>
      )}
      {missing.length > 0 && (
        <>
          <Text style={{ fontWeight: '800', marginTop: 12, marginBottom: 6 }}>{t('notYetToday')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {missing.map((g) => (
              <View key={g.key} style={{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 2, borderColor: g.color }}>
                <Text style={{ fontWeight: '700', fontSize: 13 }}>
                  {g.emoji} {GROUP_PLAIN[g.key][lang]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 10, color: colors.primaryDark, fontWeight: '800' }}>🎯 {t('nextTarget')}</Text>
        </>
      )}
    </View>
  );
}
