import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api, errorText, NetworkError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { examCounts, examStatus, examWorstFlag, type ExamField, type ExamFlag } from '../lib/pregnancy';
import { getJSON, setJSON } from '../lib/storage';
import type { AncExam, FacilityLink, Pregnancy } from '../lib/types';
import { colors, radius, statusColor, StatusKey, tones } from '../theme';
import { AudioButton } from './AudioButton';
import { Text } from './Text';
import { Bubble, Button, Card, ErrorBox, IconChip, MoreLink, Row, StatusPill } from './ui';
import { Icon } from './Icon';

const SEEN_KEY = (pid: number | string) => `nutrisense.examSeen:${pid}`;
const num = (v: number, d = 1) => (Number.isInteger(v) && d === 0 ? String(v) : v.toFixed(d));
/** For the audio: "10.4" is read as "10 koma 4". */
const spoken = (s: string, lang: 'id' | 'en') => (lang === 'id' ? s.replace(/(\d)\.(\d)/g, '$1 koma $2') : s);

/** Whether the newest check-up has been opened on this phone (client-only; no server state needed). */
export function useExamSeen(pid: number | string, latest: AncExam | null | undefined) {
  const [seen, setSeen] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    void getJSON<number | null>(SEEN_KEY(pid), null).then(setSeen).catch(() => setSeen(null));
  }, [pid]);
  const [now] = useState(() => Date.now());
  const fresh = !!latest?.received_at && now - new Date(latest.received_at).getTime() < 14 * 86400000;
  const unseen = seen !== undefined && !!latest && seen !== latest.id && fresh;
  const markSeen = useCallback(() => {
    if (latest) void setJSON(SEEN_KEY(pid), latest.id).catch(() => undefined);
  }, [pid, latest]);
  return { unseen, markSeen };
}

/** Full-screen code + QR, the thing she shows at the registration desk. */
export function LinkCodeSheet({ code, facility, visible, onClose }: { code: string; facility?: string | null; visible: boolean; onClose: () => void }) {
  const { t, lang } = useAuth();
  const spelled = code.replace('-', '').split('').join(', ');
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 20, paddingTop: 48, alignItems: 'center', gap: 14 }}>
        <Row style={{ alignSelf: 'stretch', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 21, fontWeight: '900', flex: 1 }}>{t('flSheetTitle')}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}>
            <Icon name="close" size={22} color={colors.primaryDark} />
          </Pressable>
        </Row>
        <Text style={{ color: colors.muted, alignSelf: 'stretch', fontSize: 15, lineHeight: 21 }}>{t('flSheetBody')}</Text>
        <View accessible accessibilityLabel={`${lang === 'id' ? 'Kode QR untuk bidan' : 'QR code for the midwife'}, ${code}`} style={{ padding: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border }}>
          <QRCode value={code} size={230} color={colors.text} />
        </View>
        <Text style={{ fontSize: 32, fontWeight: '900', color: colors.primaryDark, letterSpacing: 2 }} adjustsFontSizeToFit numberOfLines={1}>
          {code}
        </Text>
        {facility ? <Text style={{ color: colors.muted }}>{facility}</Text> : null}
        <AudioButton text={`${t('flCodeAudio')} ${spelled}`} />
        <Card tint={statusColor.info.bg} style={{ alignSelf: 'stretch' }}>
          <Text style={{ color: statusColor.info.fg, lineHeight: 21 }}>{t('flSheetHelp')}</Text>
        </Card>
      </ScrollView>
    </Modal>
  );
}

/** The code in large letters, as on the package card. */
function CodeBox({ code, onQr }: { code: string; onQr: () => void }) {
  const { t } = useAuth();
  return (
    <>
      <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: colors.primaryDark, fontWeight: '600', fontSize: 14 }}>{t('flCodeLabel')}</Text>
        <Text style={{ fontSize: 28, fontWeight: '900', color: colors.primaryDark, letterSpacing: 2 }} adjustsFontSizeToFit numberOfLines={1}>
          {code}
        </Text>
      </View>
      <Button variant="secondary" icon="qr-code" title={t('flShowQr')} onPress={onQr} />
    </>
  );
}

/**
 * The link to the Puskesmas on the pregnancy page. Mother: invitation with her consent (off), her code and the latest
 * result (on), or "new results" (just synced). Kader, officer, doctor: the latest result, never the code.
 */
export function FacilityLinkCard({
  p,
  link,
  stale,
  onChanged,
  unseen,
}: {
  p: Pregnancy;
  link: FacilityLink | null;
  stale?: boolean;
  onChanged: (l: FacilityLink) => void;
  unseen?: boolean;
}) {
  const { t, lang, user } = useAuth();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const mother = user?.id === p.mother_id;
  const enabled = link?.enabled ?? p.facility_link?.enabled ?? false;
  const latest = link?.exams[0] ?? p.latest_exam;
  const results = () => router.push(`/pregnancy/${p.id}/puskesmas`);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api<FacilityLink>(`/api/pregnancies/${p.id}/link`, { body: { enabled: true } }));
      setJustLinked(true);
      setTimeout(() => setJustLinked(false), 4000);
    } catch (e) {
      setError(e instanceof NetworkError ? t('flNoSignalOn') : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // Staff: what came from the facility, and whether she is connected. No code, no switch.
  if (!mother) {
    const flagged = latest ? examStatus(latest).filter((s) => s.key !== 'ok') : [];
    return (
      <Card>
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <IconChip emoji="🏥" tone="blue" size={44} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '800', fontSize: 16 }}>{t('flResultsTitle')}</Text>
            <StatusPill status={enabled ? 'ok' : 'unknown'} label={enabled ? t('flLinked') : t('flNotLinked')} />
          </View>
        </Row>
        {latest ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            <Text style={{ fontWeight: '700' }}>
              {t('flLast')} {visitTitle(latest, t)} · {formatDate(latest.exam_date, lang)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {latest.facility}
              {latest.examiner ? ` · ${latest.examiner}` : ''}
            </Text>
            <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {flagged.map((s) => (
                <StatusPill key={s.field} status={s.key} label={`${fieldShort(s.field, latest)} · ${s.word[lang]}`} />
              ))}
            </Row>
            <MoreLink label={`${t('flMoreN')} (${link?.exams.length ?? 1})`} onPress={results} />
          </View>
        ) : null}
        {!enabled && <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8, lineHeight: 20 }}>{t('flKaderOff')}</Text>}
      </Card>
    );
  }

  // Mother, not connected: invitation and consent.
  if (!enabled)
    return (
      <Card tint={tones.blue.bg}>
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <IconChip emoji="🏥" tone="blue" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '800', fontSize: 17 }}>{t('flInviteTitle')}</Text>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>{t('flInviteBody')}</Text>
          </View>
          <AudioButton text={`${t('flInviteTitle')}. ${t('flInviteBody')} ${t('flConsentText')}`} compact />
        </Row>
        <View style={{ gap: 6, marginTop: 10 }}>
          {[t('flBenefit1'), t('flBenefit2'), t('flBenefit3')].map((b) => (
            <Row key={b} style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name="checkmark-circle" size={20} color={statusColor.ok.mark} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{b}</Text>
            </Row>
          ))}
        </View>
        <View style={{ backgroundColor: '#fff', borderRadius: radius.md, padding: 12, marginTop: 12, gap: 4 }}>
          <Text style={{ fontWeight: '800', fontSize: 14 }}>{t('flConsentTitle')}</Text>
          <Text style={{ fontSize: 14, lineHeight: 20 }}>{t('flConsentText')}</Text>
        </View>
        {error && <ErrorBox message={error} />}
        <Button icon="link" title={t('flAgree')} onPress={enable} loading={busy} />
      </Card>
    );

  // Mother, just synced: new results first.
  if (unseen && latest) {
    const c = examCounts(latest);
    const worst = examStatus(latest).filter((s) => s.key !== 'ok');
    return (
      <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <StatusPill status="info" label={t('flNew')} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>{formatDate(latest.exam_date, lang)}</Text>
        </Row>
        <Row style={{ gap: 12, marginTop: 10, alignItems: 'flex-start' }}>
          <IconChip emoji="🏥" tone="blue" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '800', fontSize: 17 }}>{t('flNewTitle')}</Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {visitTitle(latest, t)} · {latest.facility}
            </Text>
          </View>
        </Row>
        <View style={{ marginTop: 10 }}>
          {worst.length ? (
            // The most serious group only, counted right: "1 perlu dicek segera: tekanan darah".
            <StatusPill
              status={c.urgent ? 'urgent' : 'action'}
              label={`${c.urgent || c.action} ${c.urgent ? t('flNeedUrgent') : t('flNeedAttention')}: ${worst
                .filter((s) => s.key === (c.urgent ? 'urgent' : 'action'))
                .map((s) => fieldName(s.field, t).split(' (')[0].toLowerCase())
                .join(', ')}`}
            />
          ) : (
            <StatusPill status="ok" label={t('flAllNormal')} />
          )}
        </View>
        <Button title={t('flSeeNew')} icon="arrow-forward" onPress={results} />
      </Card>
    );
  }

  // Mother, connected.
  return (
    <Card>
      {justLinked && <Bubble mood="cheer">{t('flLinkedNow')}</Bubble>}
      <Row style={{ gap: 12, alignItems: 'flex-start' }}>
        <IconChip emoji="🏥" tone="blue" size={44} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontWeight: '800', fontSize: 17 }}>{t('flOnTitle')}</Text>
          <StatusPill status="ok" label={t('flOn')} />
        </View>
      </Row>
      {link?.code ? <CodeBox code={link.code} onQr={() => setSheet(true)} /> : null}
      {latest ? (
        <View style={{ gap: 2, marginTop: 4 }}>
          <Text style={{ fontSize: 14 }}>
            {t('flLastIn')} <Text style={{ fontWeight: '800', fontSize: 14 }}>{formatDate(latest.exam_date, lang)}</Text>
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {latest.facility} · {visitTitle(latest, t)}
          </Text>
          <MoreLink label={`${t('flSeeResults')} (${link?.exams.length ?? 1})`} onPress={results} />
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{t('flNoneYet')}</Text>
      )}
      {stale && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>📶 {t('flStaleLine')}</Text>}
      {link?.code ? <LinkCodeSheet code={link.code} facility={link.facility} visible={sheet} onClose={() => setSheet(false)} /> : null}
    </Card>
  );
}

// ---------- check-up results ----------
type T = (k: string) => string;
export const visitTitle = (e: AncExam, t: T) => (e.visit_number ? `${t('flVisit')}${e.visit_number} (K${e.visit_number})` : t('flVisit').replace(/-$/, ''));

const FIELD_LABEL: Record<ExamField, string> = { bp: 'exBp', hb: 'exHb', muac: 'exMuac', fhr: 'exFhr', presentation: 'exPresentation', urine: 'exUrine' };
const fieldName = (f: ExamField, t: T) => t(FIELD_LABEL[f]);
/** Short form for the staff pills: "TD 150/95". */
function fieldShort(f: ExamField, e: AncExam) {
  return { bp: `TD ${e.bp_systolic ?? '–'}/${e.bp_diastolic ?? '–'}`, hb: `Hb ${e.hb_g_dl}`, muac: `LiLA ${e.muac_cm}`, fhr: `DJJ ${e.fetal_heart_rate}`, presentation: 'Letak', urine: 'Protein' }[f];
}

function fieldValue(f: ExamField, e: AncExam, t: T): { value: string; unit?: string } {
  switch (f) {
    case 'bp':
      return { value: `${e.bp_systolic ?? '–'}/${e.bp_diastolic ?? '–'}`, unit: 'mmHg' };
    case 'hb':
      return { value: num(e.hb_g_dl!), unit: 'g/dL' };
    case 'muac':
      return { value: num(e.muac_cm!), unit: 'cm' };
    case 'fhr':
      return { value: String(e.fetal_heart_rate), unit: t('perMin') };
    case 'presentation':
      return { value: t(e.fetal_presentation === 'breech' ? 'exBreech' : e.fetal_presentation === 'transverse' ? 'exTransverse' : 'exHead') };
    case 'urine':
      return { value: /^neg/i.test(e.urine_protein ?? '') ? t('exNegative') : (e.urine_protein ?? '') };
  }
}

/** One value: label, then the number in its status colour and the status in words (wraps under at large text). */
function ExamRow({ label, value, unit, status, word, hint, first }: { label: string; value: string; unit?: string; status?: StatusKey; word?: string; hint?: string; first?: boolean }) {
  const fg = status && status !== 'ok' ? statusColor[status].fg : colors.text;
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderColor: colors.line, gap: 2 }}>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
      <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}>
        <Text style={{ fontSize: 19, fontWeight: '800', color: fg }}>
          {value}
          {unit ? <Text style={{ fontSize: 14, fontWeight: '600', color: fg }}> {unit}</Text> : null}
        </Text>
        {status && word ? <StatusPill status={status} label={word} /> : null}
      </Row>
      {hint ? <Text style={{ color: colors.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

const BOX: Record<ExamFlag, { key: StatusKey; text: string; call: boolean }> = {
  hypertension: { key: 'urgent', text: 'flBpBox', call: true },
  fetal_hr: { key: 'urgent', text: 'flFhrBox', call: true },
  severe_anemia: { key: 'urgent', text: 'flSevereAnemiaBox', call: true },
  anemia: { key: 'action', text: 'flAnemiaBox', call: false },
  kek: { key: 'action', text: 'flKekBox', call: false },
};

/**
 * One check-up from the Puskesmas. The latest one opens with an action box for its most serious result (call the
 * midwife, or log tablets/food); screened values come first, the rest folds away. Older check-ups show pills only.
 */
export function ExamCard({ e, prev, latest, phone, pid, startOpen }: { e: AncExam; prev?: AncExam; latest?: boolean; phone?: string | null; pid: string | number; startOpen?: boolean }) {
  const { t, lang } = useAuth();
  const [open, setOpen] = useState(!!startOpen);
  const [more, setMore] = useState(false);
  const statuses = examStatus(e);
  const flag = latest ? examWorstFlag(e) : null;
  const c = examCounts(e);
  const screened = statuses.filter((s) => s.key !== 'ok' || ['bp', 'hb', 'muac', 'fhr'].includes(s.field));

  const folded: { label: string; value: string; unit?: string; hint?: string; status?: StatusKey; word?: string }[] = [];
  const okExtra = statuses.filter((s) => s.key === 'ok' && !['bp', 'hb', 'muac', 'fhr'].includes(s.field));
  if (e.weight_kg != null) {
    const d = prev?.weight_kg != null ? e.weight_kg - prev.weight_kg : null;
    folded.push({
      label: t('exWeight'),
      value: num(e.weight_kg),
      unit: 'kg',
      hint: d != null && prev?.visit_number ? `${d >= 0 ? t('exUpFrom') : t('exDownFrom')} ${num(Math.abs(d))} kg ${t('exSinceVisit')}${prev.visit_number}` : undefined,
    });
  }
  if (e.fundal_height_cm != null) folded.push({ label: t('exFundal'), value: num(e.fundal_height_cm, 0), unit: 'cm', hint: t('exFundalHint') });
  for (const s of okExtra) folded.push({ label: fieldName(s.field, t), ...fieldValue(s.field, e, t), status: s.key, word: s.word[lang] });
  if (e.td_immunization) folded.push({ label: t('exTd'), value: `${t('exDose')}${e.td_immunization.replace(/\D/g, '') || '?'} (${e.td_immunization})` });
  if (e.iron_tablets != null) folded.push({ label: t('exIron'), value: `${e.iron_tablets} ${t('exIronGiven')}` });
  if (e.notes) folded.push({ label: t('exNotes'), value: e.notes });

  const audio = [
    `${visitTitle(e, t)}, ${formatDate(e.exam_date, lang)}.`,
    ...screened.map((s) => `${fieldName(s.field, t).split(' (')[0]} ${fieldValue(s.field, e, t).value.replace('/', lang === 'id' ? ' per ' : ' over ')}: ${s.word[lang]}.`),
    flag ? t(BOX[flag].text) : '',
  ].join(' ');

  const header = (
    <Row style={{ alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>{visitTitle(e, t)}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {formatDate(e.exam_date, lang)}
          {e.gestational_weeks ? ` · ${Math.round(e.gestational_weeks)} ${t('weeksWord')}` : ''}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {e.facility}
          {e.examiner ? ` · ${e.examiner}` : ''}
        </Text>
      </View>
      {open ? <AudioButton text={spoken(audio, lang)} compact /> : <Icon name="chevron-forward" size={20} color={colors.muted} />}
    </Row>
  );
  const summary = c.urgent ? (
    <StatusPill status="urgent" label={`${c.urgent} ${t('flNeedUrgent')}`} />
  ) : c.action ? (
    <StatusPill status="action" label={`${c.action} ${t('flNeedAttention')}`} />
  ) : (
    <StatusPill status="ok" label={t('flAllNormal')} />
  );

  // Older check-up, closed: one line with its summary; tap to open.
  if (!open)
    return (
      <Card onPress={() => setOpen(true)}>
        {header}
        <View style={{ marginTop: 8 }}>{summary}</View>
      </Card>
    );

  const box = flag ? BOX[flag] : null;
  return (
    <Card>
      {header}
      {!box && <View style={{ marginTop: 8 }}>{summary}</View>}
      {!latest && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>{t('flAtTheTime')}</Text>}
      {box && flag && (
        <View style={{ backgroundColor: statusColor[box.key].bg, borderColor: statusColor[box.key].mark, borderWidth: 1.5, borderRadius: radius.md, padding: 12, marginTop: 10, gap: 6 }}>
          <StatusPill status={box.key} label={t(`flag_${flag}`)} />
          {flag === 'hypertension' && (
            <Text style={{ fontWeight: '800', fontSize: 16, color: statusColor.urgent.fg }}>
              {e.bp_systolic}/{e.bp_diastolic} — {t('flBpNormalBelow')}
            </Text>
          )}
          <Text style={{ fontSize: 15, lineHeight: 21 }}>{t(box.text)}</Text>
          {box.call && phone ? <Button small variant="danger" icon="call" title={t('callMidwife')} onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
          {!box.call && (
            <Button small variant="secondary" icon="checkmark-circle" title={flag === 'kek' ? t('flLogPmt') : t('flLogIron')} onPress={() => router.push(`/pregnancy/${pid}/supplements`)} />
          )}
          {box.call && flag !== 'severe_anemia' && (
            <>
              <Text style={{ fontSize: 14, lineHeight: 20 }}>{t('flGoNowIf')}</Text>
              <MoreLink label={t('flSeeDanger')} color={statusColor.urgent.fg} onPress={() => router.push(`/pregnancy/${pid}/danger`)} />
            </>
          )}
        </View>
      )}
      {screened.map((s, i) => (
        <ExamRow key={s.field} first={i === 0} label={fieldName(s.field, t)} {...fieldValue(s.field, e, t)} status={s.key} word={s.word[lang]} />
      ))}
      {folded.length > 0 && <MoreLink label={more ? t('showLess') : `${t('flMoreN')} (${folded.length} ${t('flMoreSuffix')})`} open={more} onPress={() => setMore(!more)} />}
      {more && folded.map((r, i) => <ExamRow key={r.label} first={i === 0} {...r} />)}
      <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>
        {t('flSource')} {e.facility} · {t('flReceived')} {formatDate((e.received_at ?? e.exam_date).slice(0, 10), lang)}
      </Text>
    </Card>
  );
}
