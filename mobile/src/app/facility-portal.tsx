import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { visitTitle } from '../components/FacilityLink';
import { Text } from '../components/Text';
import { Button, Card, Chip, ErrorBox, Field, H2, Row, Screen, StatusPill } from '../components/ui';
import { api, ApiError, NetworkError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import type { AncExam, MotherRisk } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors, statusColor } from '../theme';

type Facility = { id: number; name: string; kind: string };
type Num = 'weight_kg' | 'muac_cm' | 'bp_systolic' | 'bp_diastolic' | 'fundal_height_cm' | 'fetal_heart_rate' | 'iron_tablets' | 'hb_g_dl';
/** The same plausible ranges as the backend (facility_sync._RANGES). */
const RANGE: Record<Num, [number, number]> = {
  weight_kg: [25, 150], muac_cm: [12, 50], bp_systolic: [60, 260], bp_diastolic: [30, 160], fundal_height_cm: [5, 50],
  fetal_heart_rate: [60, 240], iron_tablets: [0, 120], hb_g_dl: [3, 20],
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Demo of the facility side: a midwife or doctor records a check-up and it goes to the mother's phone as the same FHIR
 * message a SIMPUS system sends. Field order follows the antenatal "10T" routine.
 */
export default function FacilityPortal() {
  const { t, lang, user } = useAuth();
  const facs = useApi<Facility[]>('/api/facilities');
  const [facility, setFacility] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [visit, setVisit] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  // null until edited: the signed-in clinician (the user may load after the first render).
  const [examinerEdit, setExaminer] = useState<string | null>(null);
  const examiner = examinerEdit ?? user?.full_name ?? '';
  const [v, setV] = useState<Record<Num, string>>({ weight_kg: '', muac_cm: '', bp_systolic: '', bp_diastolic: '', fundal_height_cm: '', fetal_heart_rate: '', iron_tablets: '', hb_g_dl: '' });
  const [presentation, setPresentation] = useState<string | null>(null);
  const [td, setTd] = useState<string | null>(null);
  const [urine, setUrine] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<Num, string>>>({});
  const [done, setDone] = useState<{ exam: AncExam; mother_name: string; risk: MotherRisk } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  // The first facility until one is picked.
  const fac = facility ?? facs.data?.[0]?.id ?? null;

  const n = (k: Num) => (v[k].trim() === '' ? null : Number(v[k].replace(',', '.')));
  const set = (k: Num) => (s: string) => {
    setV((x) => ({ ...x, [k]: s }));
    setFieldError((e) => ({ ...e, [k]: undefined }));
  };
  const rangeError = (k: Num) => {
    const x = n(k);
    if (x === null) return undefined;
    const [lo, hi] = RANGE[k];
    return Number.isNaN(x) || x < lo || x > hi ? `${t('portalErrRange')} (${lo}–${hi}). ${t('portalErrCheck')}` : undefined;
  };
  const measured = (Object.keys(RANGE) as Num[]).some((k) => k !== 'iron_tablets' && n(k) !== null);
  const codeOk = code.replace(/^NS-?/i, '').replace(/\s/g, '').length >= 6;

  // Live clinical hints for the clinician (the same thresholds the mother's app uses).
  const bpHigh = (n('bp_systolic') ?? 0) >= 140 || (n('bp_diastolic') ?? 0) >= 90;
  const muac = n('muac_cm');
  const hb = n('hb_g_dl');
  const fhr = n('fetal_heart_rate');

  const send = async () => {
    const errs: Partial<Record<Num, string>> = {};
    for (const k of Object.keys(RANGE) as Num[]) errs[k] = rangeError(k);
    setFieldError(errs);
    setError(null);
    setCodeError(codeOk ? null : t('portalErrShort'));
    setDateError(/^\d{4}-\d{2}-\d{2}$/.test(date) ? (date > today() ? t('portalErrFuture') : null) : t('portalErrDate'));
    if (!codeOk || Object.values(errs).some(Boolean) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today() || !fac) return;
    if (!measured) {
      setError(t('portalErrNone'));
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { facility_id: fac, link_code: code.trim(), exam_date: date, examiner: examiner.trim() || null };
      if (visit) body.visit_number = visit;
      for (const k of Object.keys(RANGE) as Num[]) if (n(k) !== null) body[k] = n(k);
      if (presentation) body.fetal_presentation = presentation;
      if (td) body.td_immunization = td;
      if (urine) body.urine_protein = urine;
      if (notes.trim()) body.notes = notes.trim();
      setDone(await api('/api/facility-portal/checkup', { body }));
    } catch (e) {
      // The backend answers in English for systems; the clinician gets plain Indonesian.
      if (e instanceof NetworkError) setError(t('portalErrSignal'));
      else if (e instanceof ApiError && e.status === 404) setCodeError(t('portalErrNotFound'));
      else if (e instanceof ApiError && e.status === 403) setError(t('portalErrConsent'));
      else if (e instanceof ApiError && e.status === 409) setError(t('portalErrClosed'));
      else if (e instanceof ApiError && /future/i.test(e.message)) setDateError(t('portalErrFuture'));
      else if (e instanceof ApiError && /(before|after|pregnancy began)/i.test(e.message)) setDateError(t('portalErrDate'));
      else if (e instanceof ApiError && /No check-up measurements/i.test(e.message)) setError(t('portalErrNone'));
      else if (e instanceof ApiError && /range/i.test(e.message)) setError(`${t('portalErrRange')}. ${t('portalErrCheck')}`);
      else setError(t('portalErrFallback'));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setCode('');
    setVisit(null);
    setV({ weight_kg: '', muac_cm: '', bp_systolic: '', bp_diastolic: '', fundal_height_cm: '', fetal_heart_rate: '', iron_tablets: '', hb_g_dl: '' });
    setPresentation(null);
    setTd(null);
    setUrine(null);
    setNotes('');
  };

  if (done) {
    const flagged = done.risk.reasons.length > 0 && done.risk.key !== 'ok' && done.risk.key !== 'unknown';
    return (
      <Screen key="result">
        <Card tint={statusColor.ok.bg}>
          <Text style={{ color: statusColor.ok.fg, fontWeight: '900', fontSize: 18 }}>✓ {t('portalSent')}</Text>
          <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 6 }}>{done.mother_name}</Text>
          <Text style={{ color: colors.muted }}>
            {visitTitle(done.exam, t)} · {formatDate(done.exam.exam_date, lang)} · {done.exam.facility}
          </Text>
          <Text style={{ fontWeight: '700', marginTop: 10 }}>{t('portalStatusNow')}</Text>
          <StatusPill status={done.risk.key} label={done.risk.label} large />
          {done.risk.reasons.length > 0 && <Text style={{ color: statusColor[done.risk.key].fg, fontWeight: '600', marginTop: 4 }}>{done.risk.reasons.join(' · ')}</Text>}
          <Text style={{ color: colors.muted, marginTop: 8 }}>{flagged ? t('portalTold') : t('portalToldMother')}</Text>
        </Card>
        <Button title={t('portalNext')} icon="person-add" onPress={reset} />
      </Screen>
    );
  }

  const twoCol = (a: React.ReactNode, b: React.ReactNode) => (
    <Row style={{ alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>{a}</View>
      <View style={{ flex: 1 }}>{b}</View>
    </Row>
  );
  const numField = (k: Num, label: string, hint?: string) => (
    <Field label={label} value={v[k]} onChangeText={set(k)} keyboardType="decimal-pad" error={fieldError[k]} hint={hint ?? `${RANGE[k][0]}–${RANGE[k][1]}`} onBlur={() => setFieldError((e) => ({ ...e, [k]: rangeError(k) }))} />
  );

  return (
    <Screen>
      <Card tint={statusColor.info.bg}>
        <Text style={{ color: statusColor.info.fg, lineHeight: 20 }}>ℹ️ {t('portalIntro')}</Text>
      </Card>
      {facs.error && <ErrorBox message={facs.error} onRetry={facs.reload} />}

      <Card>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{t('portalFacility')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(facs.data ?? []).map((f) => (
            <Chip key={f.id} label={f.name.replace('RSUD Prof. Dr. ', 'RSUD ')} selected={fac === f.id} onPress={() => setFacility(f.id)} />
          ))}
        </View>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label={t('portalCode')} value={code} onChangeText={(s) => { setCode(s.toUpperCase()); setCodeError(null); }} autoCapitalize="characters" placeholder={`${t('eg')} NS-7KQ2MP`} error={codeError} />
          </View>
          {Platform.OS !== 'web' && (
            <View style={{ marginBottom: codeError ? 30 : 8 }}>
              <Button
                small
                variant="secondary"
                icon="scan"
                title={t('portalScan')}
                onPress={async () => {
                  if (!permission?.granted && !(await requestPermission()).granted) return;
                  handled.current = false;
                  setScanning(true);
                }}
              />
            </View>
          )}
        </Row>
        {scanning && (
          <View style={{ height: 260, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current || !/^NS-/i.test(data)) return;
                handled.current = true;
                setScanning(false);
                setCode(data.toUpperCase());
              }}
            />
          </View>
        )}
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{t('portalVisit')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={t('portalAuto')} selected={visit === null} onPress={() => setVisit(null)} />
          {[1, 2, 3, 4, 5, 6].map((k) => (
            <Chip key={k} label={`K${k}`} selected={visit === k} onPress={() => setVisit(k)} />
          ))}
        </View>
        {twoCol(
          <Field label={t('portalDate')} value={date} onChangeText={(s) => { setDate(s); setDateError(null); }} keyboardType="numbers-and-punctuation" error={dateError} />,
          <Field label={t('portalExaminer')} value={examiner} onChangeText={setExaminer} />,
        )}
      </Card>

      <Card>
        <H2>{t('portalMeasures')}</H2>
        <Text style={{ color: colors.muted, marginTop: -8, marginBottom: 8 }}>{t('portalOnlyChecked')}</Text>
        {twoCol(numField('weight_kg', 'Berat (kg)'), numField('muac_cm', 'LiLA (cm)'))}
        {muac !== null && muac < 23.5 && <StatusPill status="action" label="KEK (< 23,5 cm)" />}
        <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>{t('portalBp')}</Text>
        {twoCol(numField('bp_systolic', 'Sistolik'), numField('bp_diastolic', 'Diastolik'))}
        {bpHigh && <StatusPill status="urgent" label={t('portalBpHigh')} />}
        {twoCol(numField('fundal_height_cm', 'TFU (cm)'), numField('fetal_heart_rate', 'DJJ (/menit)', `60–240 · ${t('portalFhrNormal')}`))}
        {fhr !== null && (fhr < 120 || fhr > 160) && <StatusPill status="urgent" label="DJJ di luar 120–160" />}
        <Text style={{ fontWeight: '700', marginVertical: 6 }}>Letak janin</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[['head', 'Kepala'], ['breech', 'Sungsang'], ['transverse', 'Lintang']].map(([k, l]) => (
            <Chip key={k} label={l} selected={presentation === k} onPress={() => setPresentation(presentation === k ? null : k)} />
          ))}
        </View>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>Imunisasi Td</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {['TT1', 'TT2', 'TT3', 'TT4', 'TT5'].map((k) => (
            <Chip key={k} label={k} selected={td === k} onPress={() => setTd(td === k ? null : k)} />
          ))}
        </View>
        {twoCol(numField('iron_tablets', 'TTD (tablet)'), numField('hb_g_dl', 'Hb (g/dL)'))}
        {hb !== null && hb < 11 && <StatusPill status={hb < 7 ? 'urgent' : 'action'} label={hb < 7 ? 'Anemia berat (< 7)' : 'Anemia (< 11)'} />}
        <Text style={{ fontWeight: '700', marginVertical: 6 }}>Protein urine</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {['negatif', '+1', '+2', '+3'].map((k) => (
            <Chip key={k} label={k === 'negatif' ? 'Negatif' : k} selected={urine === k} onPress={() => setUrine(urine === k ? null : k)} />
          ))}
        </View>
        <Field label="Catatan" value={notes} onChangeText={setNotes} multiline maxLength={500} />
      </Card>

      {error && <ErrorBox message={error} onRetry={error === t('portalErrSignal') ? send : undefined} />}
      <Button title={t('portalSend')} icon="send" onPress={send} loading={busy} disabled={!codeOk || !measured || !fac} />
    </Screen>
  );
}
