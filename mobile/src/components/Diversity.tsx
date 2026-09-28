import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useAuth } from '../lib/auth';
import { FOOD_GROUPS, GROUP_PLAIN } from '../lib/fun';
import { colors, radius, statusColor } from '../theme';
import { Text } from './Text';
import { Row, StatusPill } from './ui';

/** Progress ring: how many of the 8 WHO food groups were eaten today. */
function Ring({ n, size }: { n: number; size: number }) {
  const { t } = useAuth();
  const id = 'ring' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#34C77B" />
            <Stop offset="1" stopColor="#F5B81C" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#EEEBF8" strokeWidth={stroke} fill="none" />
        {n > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(len * Math.min(n, 8)) / 8} ${len}`} />
        )}
      </Svg>
      <Text style={{ fontSize: size * 0.24, fontWeight: '900' }}>{n}/8</Text>
      {size >= 90 && <Text style={{ fontSize: 11, color: colors.muted, marginTop: -2 }}>{t('groupsShort')}</Text>}
    </View>
  );
}

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
        <Ring n={n} size={compact ? 72 : 104} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('diversityTitle')}</Text>
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
              <View key={g.key} style={{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1.5, borderColor: '#E4E0F3' }}>
                <Text style={{ fontWeight: '700', fontSize: 13 }}>
                  {g.emoji} {GROUP_PLAIN[g.key][lang]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 10, color: colors.primary, fontWeight: '800' }}>🎯 {t('nextTarget')}</Text>
        </>
      )}
    </View>
  );
}
