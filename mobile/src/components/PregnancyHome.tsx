import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { motherState, weeksText } from '../lib/pregnancy';
import type { Pregnancy } from '../lib/types';
import { colors, statusColor } from '../theme';
import { RiskCard } from './PregnancyParts';
import { Text } from './Text';
import { Bar, Card, QuickAction, Row, Section, StatusPill } from './ui';

/** Home when "Bunda" is picked: how the pregnancy is, what to do today, four shortcuts. Same shape as the child's home. */
export function PregnancyHome({ p }: { p: Pregnancy }) {
  const { t, lang } = useAuth();
  const st = motherState(p);
  const delivered = p.status === 'delivered';
  const go = (action: string) =>
    router.push((({ supplements: `/pregnancy/${p.id}/supplements`, anc: `/pregnancy/${p.id}/anc`, measure: `/pregnancy/${p.id}/measure`, danger: `/pregnancy/${p.id}/danger` }) as Record<string, string>)[action] as never);
  const nextNifas = p.nifas?.find((v) => v.status === 'due' || v.status === 'overdue');

  return (
    <>
      {/* How is the pregnancy? */}
      <Card onPress={() => router.push(`/pregnancy/${p.id}`)}>
        <Row style={{ gap: 14 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 32 }}>🤰</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 20, fontWeight: '800' }}>{delivered ? t('nifasPeriod') : weeksText(p.gestational_weeks, p.gestational_extra_days, lang)}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {delivered ? formatDate(p.delivered_at, lang) : `Trimester ${p.trimester} · ${t('hplLabel')} ${formatDate(p.hpl, lang)}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#A09CB5" />
        </Row>
        <View style={{ marginTop: 14, gap: 6 }}>
          <StatusPill status={st.key} label={st.text} large />
          {st.reasons && !delivered ? <Text style={{ color: statusColor[st.key].fg, fontSize: 13, fontWeight: '600' }}>{st.reasons}</Text> : null}
        </View>
        {!delivered && (
          <View style={{ marginTop: 14 }}>
            <Bar pct={(p.gestational_days / 280) * 100} color={colors.primary} warnBelow={0} />
          </View>
        )}
      </Card>
      <RiskCard p={p} />

      {/* What to do today */}
      <Section title={t('forToday')} />
      <Card>
        {p.today.map((item) => {
          const c = statusColor[item.status];
          const done = item.status === 'ok';
          return (
            <Pressable key={item.key} onPress={() => go(item.action)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Row style={{ gap: 10 }}>
                <Ionicons name={done ? 'checkmark-circle' : 'alert-circle'} size={21} color={c.mark} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: done ? '400' : '700', color: done ? colors.text : c.fg }}>{item.text}</Text>
                {!done && <Ionicons name="chevron-forward" size={18} color={c.fg} />}
              </Row>
            </Pressable>
          );
        })}
        {delivered && nextNifas && (
          <Pressable onPress={() => router.push(`/pregnancy/${p.id}`)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="alert-circle" size={21} color={statusColor.action.mark} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: statusColor.action.fg }}>{t('nifasTitle')}</Text>
              <Ionicons name="chevron-forward" size={18} color={statusColor.action.fg} />
            </Row>
          </Pressable>
        )}
      </Card>

      {/* Quick actions */}
      {!delivered && (
        <Row style={{ alignItems: 'flex-start', gap: 4, marginTop: 4, marginBottom: 20 }}>
          <QuickAction emoji="📏" tone="blue" label={t('motherCheck')} onPress={() => go('measure')} />
          <QuickAction emoji="📅" tone="lavender" label={t('ancTitle')} onPress={() => go('anc')} />
          <QuickAction emoji="🚨" tone="pink" label={t('urgentSigns')} onPress={() => go('danger')} />
          <QuickAction emoji="🏥" tone="orange" label={t('birthPlan')} onPress={() => router.push(`/pregnancy/${p.id}/plan`)} />
        </Row>
      )}
    </>
  );
}
