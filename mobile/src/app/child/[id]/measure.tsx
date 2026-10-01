import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { AssessmentView } from '../../../components/AssessmentView';
import { Mascot } from '../../../components/Mascot';
import { Escalation } from '../../../components/SymptomTiles';
import { Text } from '../../../components/Text';
import { AudioButton } from '../../../components/AudioButton';
import { Bubble, Button, Card, Chip, ErrorBox, Field, IconChip, PressScale, Row, Screen, Segmented, StatusPill, StepDots } from '../../../components/ui';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatAge, formatDate } from '../../../lib/fun';
import { enqueue, uuid } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import type { Assessment, Child, Measurement } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { measurementProblems } from '../../../lib/validate';
import { colors, radius, statusColor, Tone, tones } from '../../../theme';

type Pos = 'lying' | 'standing';
/** Local date (YYYY-MM-DD), `days` from today: NTT is UTC+8, so the UTC date is wrong in the early morning. */
const today = (days = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Simple line illustration of the correct measuring position. */
function Illustration({ pos }: { pos: Pos }) {
  const ink = colors.text;
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      {pos === 'standing' ? (
        <Svg width={200} height={150} viewBox="0 0 200 150">
          <Rect x={120} y={5} width={10} height={140} fill={colors.accentSoft} stroke={colors.accent} />
          {[20, 40, 60, 80, 100, 120].map((y) => (
            <Line key={y} x1={120} x2={128} y1={y} y2={y} stroke={colors.accent} strokeWidth={2} />
          ))}
          <Line x1={20} x2={180} y1={145} y2={145} stroke={ink} strokeWidth={3} />
          <Rect x={82} y={18} width={42} height={5} fill={colors.primary} />
          <Circle cx={103} cy={36} r={12} fill="#FFD6BF" stroke={ink} strokeWidth={2} />
          <Line x1={103} y1={48} x2={103} y2={100} stroke={ink} strokeWidth={4} />
          <Line x1={103} y1={100} x2={96} y2={144} stroke={ink} strokeWidth={4} />
          <Line x1={103} y1={100} x2={110} y2={144} stroke={ink} strokeWidth={4} />
          <Line x1={103} y1={60} x2={90} y2={92} stroke={ink} strokeWidth={4} />
          <Line x1={103} y1={60} x2={116} y2={92} stroke={ink} strokeWidth={4} />
        </Svg>
      ) : (
        <Svg width={220} height={110} viewBox="0 0 220 110">
          <Rect x={10} y={70} width={200} height={14} rx={4} fill={colors.accentSoft} stroke={colors.accent} />
          {[30, 60, 90, 120, 150, 180].map((x) => (
            <Line key={x} x1={x} x2={x} y1={70} y2={78} stroke={colors.accent} strokeWidth={2} />
          ))}
          <Rect x={12} y={40} width={6} height={32} fill={colors.primary} />
          <Rect x={178} y={40} width={6} height={32} fill={colors.primary} />
          <Circle cx={34} cy={58} r={12} fill="#FFD6BF" stroke={ink} strokeWidth={2} />
          <Path d="M46 60 L130 60" stroke={ink} strokeWidth={5} strokeLinecap="round" />
          <Path d="M130 60 L176 56 M130 62 L176 64" stroke={ink} strokeWidth={4} strokeLinecap="round" />
          <Path d="M70 60 L90 46 M80 60 L100 72" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

function Steps({ step }: { step: number }) {
  const { t } = useAuth();
  return <StepDots total={4} current={step - 1} label={`${t('step')} ${step} ${t('of')} 4`} />;
}

/** One confirmed number on the review step: icon, value and what it is. */
function ReviewRow({ icon, tone, value, label }: { icon: 'resize' | 'scale' | 'calendar' | 'body' | 'person' | 'footsteps'; tone: Tone; value: string; label: string }) {
  return (
    <Row style={{ gap: 14, paddingVertical: 10 }}>
      <IconChip icon={icon} tone={tone} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 22, fontWeight: '900' }}>{value}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      </View>
    </Row>
  );
}

export default function Measure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, user } = useAuth();
  const sync = useSync();
  const child = useApi<Child>(`/api/children/${id}`);
  const [by, setBy] = useState<'mother' | 'kader'>(user?.role === 'kader' ? 'kader' : 'mother');
  const [oedema, setOedema] = useState<'no' | 'yes' | null>(null);
  const [step, setStep] = useState(1);
  const [position, setPosition] = useState<Pos | null>(null);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [muac, setMuac] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedInfo, setQueuedInfo] = useState(false);
  const [result, setResult] = useState<{ measurement: Measurement; assessment: Assessment | null } | null>(null);

  const c = child.data;
  const name = c?.name.split(' ')[0] ?? t('theChild');
  // Without the child's age (not opened before, no signal) the app cannot recommend a position: the user picks.
  const recommended: Pos | null = c ? (c.age_months < 24 ? 'lying' : 'standing') : null;
  const pos: Pos = position ?? recommended ?? 'standing';
  const posChosen = position !== null || recommended !== null;
  const [otherDate, setOtherDate] = useState(false);
  const num = (s: string) => Number(s.replace(',', '.'));
  const last = c?.latest_measurement;
  const warnings: string[] = [];
  if (last && height && num(height) < last.height_cm - 1.5) warnings.push(`${t('warnShorter')} (${last.height_cm} cm)`);
  if (last && weight && Math.abs(num(weight) - last.weight_kg) > 3) warnings.push(`${t('warnWeightJump')} (${last.weight_kg} kg)`);
  const bad = measurementProblems(num(weight), num(height));
  const blocked = bad.weight || bad.height;
  const swap = () => {
    setWeight(height);
    setHeight(weight);
  };

  const save = async () => {
    const body = {
      weight_kg: num(weight),
      height_cm: num(height),
      muac_cm: muac ? num(muac) : null,
      position: pos,
      measured_at: date,
      measured_by: by,
      oedema: oedema === 'yes',
      client_uuid: uuid(),
    };
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`/api/children/${id}/measurements`, { body }));
    } catch (e) {
      if (e instanceof NetworkError) {
        await enqueue('measurement', Number(id), c?.name ?? '', body);
        await sync.refresh();
        setQueuedInfo(true);
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (queuedInfo)
    return (
      <Screen key="result0">
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Mascot size={96} mood="happy" />
        </View>
        {oedema === 'yes' && <Escalation facility={c?.facility} phone={c?.care_team?.find((x) => x.role === 'kader')?.phone} />}
        <Card tint={statusColor.info.bg}>
          <Text style={{ fontWeight: '900', color: statusColor.info.fg }}>📶 {t('savedOnPhone')}</Text>
          <Text style={{ color: statusColor.info.fg }}>{t('offlineQueued')}</Text>
        </Card>
        <Button title={`${t('seeProfileOf')} ${name}`} icon="arrow-forward" onPress={() => router.replace(`/child/${id}`)} />
      </Screen>
    );

  if (result) {
    const m = result.measurement;
    return (
      <Screen key="result1">
        <Card tint={tones.green.bg}>
          <Text style={{ fontWeight: '900', color: colors.ok }}>✓ {t('measurementSaved')}</Text>
          <Text style={{ fontSize: 22, fontWeight: '900' }}>
            📏 {m.height_cm} cm · ⚖️ {m.weight_kg} kg
          </Text>
          <Text style={{ color: colors.muted }}>{formatDate(m.measured_at, lang)}</Text>
        </Card>
        {result.assessment && <AssessmentView a={result.assessment} facility={c?.facility} kaderPhone={c?.care_team?.find((x) => x.role === 'kader')?.phone} />}
        <Button title={`${t('seeProfileOf')} ${name}`} onPress={() => router.replace(`/child/${id}`)} icon="arrow-forward" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Steps step={step} />

      {step === 1 && (
        <>
          <Bubble mood="happy">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>
              {t('howMeasured')} {name}?
            </Text>
            {c && (
              <Text style={{ color: colors.muted }}>
                {name} · {formatAge(c.age_months, lang)}
              </Text>
            )}
          </Bubble>
          <Row style={{ gap: 12, alignItems: 'stretch', marginBottom: 8 }}>
            {(['lying', 'standing'] as Pos[]).map((p) => {
              const on = pos === p;
              const tone = p === 'lying' ? tones.blue : tones.green;
              return (
                <PressScale
                  key={p}
                  onPress={() => setPosition(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={{ flex: 1, backgroundColor: on ? colors.primarySoft : '#fff', borderWidth: 2, borderColor: on ? colors.primary : colors.border, borderRadius: radius.lg, padding: 14, alignItems: 'center', gap: 6 }}
                >
                  {on && (
                    <View style={{ position: 'absolute', top: 10, right: 10 }}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                    <Text style={{ fontSize: 40 }}>{p === 'lying' ? '🛏️' : '🧍'}</Text>
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '900', textAlign: 'center' }}>{t(p)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>{p === 'lying' ? t('lyingHint') : t('standingHint')}</Text>
                  {p === recommended && <StatusPill status="ok" label={t('recommended')} />}
                  {!recommended && <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>{p === 'lying' ? t('under2') : t('over2')}</Text>}
                </PressScale>
              );
            })}
          </Row>
          <Button title={t('next')} icon="arrow-forward" disabled={!posChosen} onPress={() => setStep(2)} />
          {/* Kader measure many children: the instructions can be skipped once known. */}
          <Button title={t('skipInstructions')} variant="ghost" disabled={!posChosen} onPress={() => setStep(3)} />
        </>
      )}

      {step === 2 && (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>{t('howToMeasure')}</Text>
              <AudioButton
                text={[t('howToMeasure'), ...(pos === 'standing' ? [t('instShoes'), t('instHeadStraight'), t('instBackWall'), t('instLookAhead')] : [t('instShoes'), t('instHeadBoard'), t('instLegsStraight'), t('instTwoPeople')]), t('instWeigh')].join('. ')}
              />
            </Row>
            <View style={{ backgroundColor: tones.blue.bg, borderRadius: radius.lg, marginVertical: 8 }}>
              <Illustration pos={pos} />
            </View>
            {(pos === 'standing'
              ? [t('instShoes'), t('instHeadStraight'), t('instBackWall'), t('instLookAhead')]
              : [t('instShoes'), t('instHeadBoard'), t('instLegsStraight'), t('instTwoPeople')]
            ).map((s, i) => (
              <Row key={s} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={24} color={statusColor.ok.mark} />
                <Text style={{ flex: 1, fontSize: 16, lineHeight: 23 }}>{s}</Text>
              </Row>
            ))}
            <Text style={{ color: colors.muted, fontSize: 13 }}>⚖️ {t('instWeigh')}</Text>
          </Card>
          <Button title={t('readyToEnter')} icon="arrow-forward" onPress={() => setStep(3)} />
          <Button title={t('back')} variant="ghost" onPress={() => setStep(1)} />
        </>
      )}

      {step === 3 && (
        <>
          <Card>
            <Field label={`⚖️ ${t('weight')}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={`${t('eg')} 10.4`} />
            <Field label={`📏 ${pos === 'lying' ? t('lengthLbl') : t('heightLbl')}`} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder={`${t('eg')} 82.5`} />
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>🗓️ {t('dateLbl')}</Text>
            <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              <Chip label={t('todayLbl')} selected={!otherDate && date === today()} onPress={() => { setOtherDate(false); setDate(today()); }} />
              <Chip label={t('yesterdayLbl')} selected={!otherDate && date === today(-1)} onPress={() => { setOtherDate(false); setDate(today(-1)); }} />
              <Chip label={t('otherDateLbl')} selected={otherDate} onPress={() => setOtherDate(true)} />
            </Row>
            {otherDate && <Field label={t('measuredAt')} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />}
            <Field label={`💪 ${t('muac')}`} value={muac} onChangeText={setMuac} keyboardType="decimal-pad" />
          </Card>
          <Card>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>👤 {t('measuredBy')}</Text>
            <Segmented<'mother' | 'kader'>
              value={by}
              onChange={setBy}
              options={[
                { value: 'mother', label: `👩 ${t('byMother')}` },
                { value: 'kader', label: `👩‍⚕️ Kader` },
              ]}
            />
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>🦶 {t('oedemaQ')}</Text>
              <AudioButton text={`${t('oedemaQ')} ${t('oedemaHow')}`} compact />
            </Row>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>{t('oedemaHow')}</Text>
            <Segmented<'no' | 'yes'>
              value={oedema ?? ('' as 'no')}
              onChange={setOedema}
              options={[
                { value: 'no', label: t('noLbl') },
                { value: 'yes', label: t('yesSwollen') },
              ]}
            />
            {oedema === 'yes' && <Text style={{ color: colors.danger, fontWeight: '700' }}>🚨 {t('oedemaWarn')}</Text>}
          </Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Button title={t('back')} variant="ghost" onPress={() => setStep(2)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title={t('next')} icon="arrow-forward" disabled={!weight || !height || !oedema || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => setStep(4)} />
            </View>
          </Row>
        </>
      )}

      {step === 4 && (
        <>
          <Bubble mood="thinking">
            <Text style={{ fontWeight: '900', fontSize: 17 }}>
              {t('checkAgain')} {name}
            </Text>
          </Bubble>
          <Card>
            <ReviewRow icon="resize" tone="blue" value={`${height} cm`} label={`${pos === 'lying' ? t('lengthLbl') : t('heightLbl')} · ${t(pos)}`} />
            <ReviewRow icon="scale" tone="orange" value={`${weight} kg`} label={t('weight')} />
            <ReviewRow icon="calendar" tone="lavender" value={formatDate(date, lang)} label={t('dateLbl')} />
            {muac ? <ReviewRow icon="body" tone="green" value={`${muac} cm`} label={t('muac')} /> : null}
            <ReviewRow icon="person" tone="pink" value={by === 'kader' ? 'Kader' : t('byMother')} label={t('measuredBy')} />
            <ReviewRow icon="footsteps" tone={oedema === 'yes' ? 'orange' : 'green'} value={oedema === 'yes' ? t('yesSwollen') : t('noLbl')} label={t('oedemaShort')} />
          </Card>
          {blocked && (
            <Card tint={statusColor.urgent.bg}>
              {bad.weight && <Text style={{ color: statusColor.urgent.fg, fontWeight: '800' }}>🔴 {t('impossibleWeight').replace('{x}', weight)}</Text>}
              {bad.height && <Text style={{ color: statusColor.urgent.fg, fontWeight: '800' }}>🔴 {t('impossibleHeight').replace('{x}', height)}</Text>}
              {bad.swapped && <Button small variant="secondary" icon="swap-vertical" title={t('swapValues')} onPress={swap} />}
            </Card>
          )}
          {warnings.map((w) => (
            <Card key={w} tint={statusColor.monitor.bg}>
              <Text style={{ color: statusColor.monitor.fg, fontWeight: '800' }}>🟡 {w}</Text>
            </Card>
          ))}
          {error && <ErrorBox message={error} />}
          {/* When something looks wrong, fixing it is the main action; impossible values cannot be saved. */}
          <Row>
            <View style={{ flex: blocked || warnings.length ? 2 : 1 }}>
              <Button title={t('edit')} variant={blocked || warnings.length ? 'primary' : 'ghost'} icon="create-outline" onPress={() => setStep(3)} />
            </View>
            <View style={{ flex: blocked || warnings.length ? 1 : 2 }}>
              <Button title={t('save')} variant={blocked || warnings.length ? 'secondary' : 'primary'} icon="checkmark-circle" loading={busy} disabled={blocked} onPress={save} />
            </View>
          </Row>
          <Text style={{ fontSize: 13, textAlign: 'center', color: colors.muted, marginTop: 6 }}>{t('disclaimer')}</Text>
        </>
      )}
    </Screen>
  );
}
