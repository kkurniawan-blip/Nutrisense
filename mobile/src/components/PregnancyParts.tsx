import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { NIFAS_LABEL, VISIT_STATUS } from '../lib/pregnancy';
import type { AncVisit, NifasVisit, Pregnancy } from '../lib/types';
import { colors, statusColor, tones } from '../theme';
import { AudioButton } from './AudioButton';
import { Text } from './Text';
import { Button, Card, Row, StatusPill } from './ui';

/**
 * Risiko sedang / tinggi: the level in large type, why in a few words, and one action: call the midwife
 * (the Puskesmas number). Shown only when the level asks for contact.
 */
export function RiskCard({ p }: { p: Pregnancy }) {
  const { t } = useAuth();
  const r = p.risk;
  if (!r.contact || p.status !== 'active') return null;
  const c = statusColor[r.key];
  const tip = r.key === 'urgent' ? t('riskHighTip') : t('riskMidTip');
  const phone = p.facility?.phone;
  return (
    <Card tint={c.bg} style={r.key === 'urgent' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: c.fg }}>{r.label}</Text>
          <Text style={{ fontWeight: '700', color: c.fg }}>{r.reasons.join(' · ')}</Text>
        </View>
        <AudioButton text={`${r.label}. ${r.reasons.join(', ')}. ${tip}`} compact />
      </Row>
      <Text style={{ marginTop: 6 }}>{tip}</Text>
      {phone ? (
        <Button variant={r.key === 'urgent' ? 'danger' : 'primary'} title={t('callMidwife')} icon="call" onPress={() => Linking.openURL(`tel:${phone}`)} />
      ) : null}
      {p.facility ? (
        <Text style={{ color: colors.muted, fontSize: 12.5, textAlign: 'center' }}>
          {p.facility.name}
          {phone ? ` · ${phone}` : ''}
        </Text>
      ) : null}
    </Card>
  );
}

/** K1..K6 as six circles: tick when done, coloured ring when due or missed. */
/** K1..K6 as six circles; a small 🏥 badge marks a visit whose results came from the Puskesmas. */
export function AncDots({ anc, fromFacility = [] }: { anc: AncVisit[]; fromFacility?: number[] }) {
  const { t } = useAuth();
  const marked = anc.some((v) => v.status === 'done' && fromFacility.includes(v.number));
  return (
    <>
      <Row style={{ justifyContent: 'space-between' }}>
        {anc.map((v) => {
          const c = statusColor[VISIT_STATUS[v.status].key];
          const done = v.status === 'done';
          const fac = done && fromFacility.includes(v.number);
          return (
            <View key={v.number} style={{ alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`K${v.number} ${VISIT_STATUS[v.status].label.id}${fac ? ', dari Puskesmas' : ''}`}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? colors.mint : v.status === 'upcoming' ? colors.line : c.bg,
                  borderWidth: done || v.status === 'upcoming' ? 0 : 2,
                  borderColor: c.mark,
                }}
              >
                {done ? <Ionicons name="checkmark" size={20} color="#fff" /> : <Text style={{ fontWeight: '800', fontSize: 13, color: v.status === 'upcoming' ? colors.muted : c.fg }}>K{v.number}</Text>}
                {fac && (
                  <View style={{ position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.sky, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="business" size={11} color={tones.blue.fg} />
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>Tri {v.trimester}</Text>
            </View>
          );
        })}
      </Row>
      {marked && (
        <Row style={{ gap: 6, marginTop: 8 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.sky, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="business" size={11} color={tones.blue.fg} />
          </View>
          <Text style={{ fontSize: 13, color: colors.muted }}>{t('flLegend')}</Text>
        </Row>
      )}
    </>
  );
}

export function NifasList({ nifas }: { nifas: NifasVisit[] }) {
  const { lang } = useAuth();
  return (
    <View>
      {nifas.map((v, i) => {
        const st = VISIT_STATUS[v.status];
        return (
          <Row key={v.code} style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: colors.line, gap: 10 }}>
            <Text style={{ fontSize: 20 }}>{v.who === 'mother' ? '🤱' : '👶'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{NIFAS_LABEL[v.code][lang]}</Text>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {formatDate(v.window_start, lang)} – {formatDate(v.window_end, lang)}
              </Text>
            </View>
            <StatusPill status={st.key} label={st.label[lang]} />
          </Row>
        );
      })}
    </View>
  );
}

