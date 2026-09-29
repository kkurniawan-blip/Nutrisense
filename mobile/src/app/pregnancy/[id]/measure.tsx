import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { Text } from '../../../components/Text';
import { Bubble, Button, Card, ErrorBox, Field, IconChip, ListRow, Row, Screen, StatusPill, StepDots } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import { FLAG_ADVICE, FLAG_LABEL } from '../../../lib/pregnancy';
import type { MotherFlag } from '../../../lib/types';
import { colors, radius, statusColor, tones } from '../../../theme';

const today = () => new Date().toISOString().slice(0, 10);

/** Where the LiLA tape goes: halfway between shoulder and elbow. */
function ArmIllustration() {
  const ink = colors.text;
  return (
    <Svg width={220} height={120} viewBox="0 0 220 120">
      <Circle cx={40} cy={40} r={16} fill="#FFD6BF" stroke={ink} strokeWidth={2} />
      <Rect x={30} y={60} width={24} height={52} rx={10} fill="#FFD6BF" stroke={ink} strokeWidth={2} />
      <Rect x={54} y={64} width={130} height={22} rx={11} fill="#FFD6BF" stroke={ink} strokeWidth={2} />
      <Rect x={108} y={58} width={12} height={34} rx={3} fill={colors.accent} />
      {[62, 68, 74, 80, 86].map((y) => (
        <Line key={y} x1={108} x2={114} y1={y} y2={y} stroke="#fff" strokeWidth={1.5} />
      ))}
      <Line x1={56} x2={184} y1={100} y2={100} stroke={colors.primary} strokeWidth={2} strokeDasharray="4 4" />
      <Circle cx={114} cy={100} r={4} fill={colors.primary} />
    </Svg>
  );
}

/** Catat ibu: LiLA and Hb in three short steps, then what they mean. */
export default function MotherMeasure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [step, setStep] = useState(1);
  const [muac, setMuac] = useState('');
  const [hb, setHb] = useState('');
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ flags: MotherFlag[] } | null>(null);
  const num = (s: string) => Number(s.replace(',', '.'));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { muac_cm: muac ? num(muac) : null, hb_g_dl: hb ? num(hb) : null, weight_kg: weight ? num(weight) : null, measured_at: date };
      setResult(await api(`/api/pregnancies/${id}/measurements`, { body }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const flags = result.flags;
    return (
      <Screen>
        <Card tint={flags.length ? statusColor.action.bg : tones.green.bg}>
          <Text style={{ fontWeight: '900', color: flags.length ? statusColor.action.fg : colors.ok }}>✓ {t('motherSaved')}</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', marginTop: 2 }}>
            {muac ? `LiLA ${muac} cm` : ''}
            {muac && hb ? ' · ' : ''}
            {hb ? `Hb ${hb}` : ''}
          </Text>
          <Text style={{ color: colors.muted }}>{formatDate(date, lang)}</Text>
        </Card>
        <Card>
          <Row style={{ gap: 12, marginBottom: flags.length ? 10 : 0 }}>
            <View style={{ flex: 1, gap: 6 }}>
              {flags.length ? (
                flags.map((f) => <StatusPill key={f.code} status={f.status} label={FLAG_LABEL[f.code][lang]} large />)
              ) : (
                <StatusPill status="ok" label={t('motherFine')} large />
              )}
            </View>
          </Row>
          {flags.map((f) => (
            <ListRow key={f.code} emoji={f.code === 'kek' ? '🍪' : f.code === 'short_stature' ? '🏥' : '💊'} title={FLAG_ADVICE[f.code][lang]} right={<View />} />
          ))}
          {flags.length > 0 && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>{t('kaderWillSee')}</Text>}
        </Card>
        <Button title={t('backToPregnancy')} icon="arrow-forward" onPress={() => router.replace(`/pregnancy/${id}`)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <StepDots total={3} current={step - 1} label={`${t('step')} ${step} ${t('of')} 3`} />

      {step === 1 && (
        <>
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '900', marginBottom: 4 }}>{t('muacTitle')}</Text>
            <View style={{ backgroundColor: tones.orange.bg, borderRadius: radius.lg, marginVertical: 8, alignItems: 'center', paddingVertical: 6 }}>
              <ArmIllustration />
            </View>
            {[t('muacHow1'), t('muacHow2'), t('muacHow3')].map((s) => (
              <Row key={s} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color={statusColor.ok.mark} />
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{s}</Text>
              </Row>
            ))}
            <Field label={`📏 ${t('muacField')}`} value={muac} onChangeText={setMuac} keyboardType="decimal-pad" placeholder="24.0" />
          </Card>
          <Button title={t('next')} icon="arrow-forward" onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '900', marginBottom: 12 }}>{t('hbTitle')}</Text>
            <Field label={`🩸 ${t('hbField')}`} value={hb} onChangeText={setHb} keyboardType="decimal-pad" placeholder="11.5" hint={t('hbHint')} />
            <Field label={`⚖️ ${t('weightMomField')}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="55" />
            <Field label={`🗓️ ${t('measuredAt')}`} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
          </Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" disabled={(!muac && !hb && !weight) || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => setStep(3)} />
            </View>
          </Row>
        </>
      )}

      {step === 3 && (
        <>
          <Bubble mood="thinking">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('reviewTitle')}</Text>
          </Bubble>
          <Card>
            {[
              { icon: 'body' as const, tone: 'orange' as const, value: muac ? `${muac} cm` : '–', label: t('muacField') },
              { icon: 'water' as const, tone: 'pink' as const, value: hb ? `${hb} g/dL` : '–', label: t('hbField') },
              ...(weight ? [{ icon: 'scale' as const, tone: 'blue' as const, value: `${weight} kg`, label: t('weightMomField') }] : []),
              { icon: 'calendar' as const, tone: 'lavender' as const, value: formatDate(date, lang), label: t('measuredAt') },
            ].map((r) => (
              <Row key={r.label} style={{ gap: 14, paddingVertical: 10 }}>
                <IconChip icon={r.icon} tone={r.tone} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 22, fontWeight: '900' }}>{r.value}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{r.label}</Text>
                </View>
              </Row>
            ))}
          </Card>
          {error && <ErrorBox message={error} />}
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('edit')} variant="ghost" icon="create-outline" onPress={() => setStep(1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('save')} icon="checkmark-circle" loading={busy} onPress={save} />
            </View>
          </Row>
          <Text style={{ fontSize: 12, textAlign: 'center', color: colors.muted, marginTop: 6 }}>{t('disclaimer')}</Text>
        </>
      )}
    </Screen>
  );
}
