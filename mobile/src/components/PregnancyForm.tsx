import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/fun';
import { EDUCATION, fromHpht, hphtFromWeeks, weeksText } from '../lib/pregnancy';
import { colors } from '../theme';
import { Text } from './Text';
import { Card, Chip, Field, IconChip, Row, Segmented } from './ui';

export type HphtMode = 'date' | 'weeks';

const num = (s: string) => Number(s.replace(',', '.'));

/** Gestational age from either the HPHT date or the weeks, with validity for the Lanjut button. */
export function gestation(mode: HphtMode, hpht: string, weeks: string) {
  const start = mode === 'date' ? (/^\d{4}-\d{2}-\d{2}$/.test(hpht) ? hpht : null) : weeks && num(weeks) >= 1 && num(weeks) <= 42 ? hphtFromWeeks(num(weeks)) : null;
  const ga = start ? fromHpht(start) : null;
  return { ga, valid: !!ga && ga.days >= 0 && ga.weeks <= 44, body: mode === 'date' ? { hpht } : { gestational_weeks: num(weeks) } };
}

/** HPHT date or weeks, with the weeks and HPL shown at once. */
export function HphtCard({ mode, setMode, hpht, setHpht, weeks, setWeeks }: { mode: HphtMode; setMode: (m: HphtMode) => void; hpht: string; setHpht: (v: string) => void; weeks: string; setWeeks: (v: string) => void }) {
  const { t, lang } = useAuth();
  const { ga, valid } = gestation(mode, hpht, weeks);
  return (
    <>
      <Segmented<HphtMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'date', label: t('hphtDate') },
          { value: 'weeks', label: t('weeksNow') },
        ]}
      />
      <Card>
        {mode === 'date' ? (
          <Field label={`🗓️ ${t('hphtDate')} (TTTT-BB-HH)`} value={hpht} onChangeText={setHpht} placeholder={`${t('eg')} 2026-04-10`} keyboardType="numbers-and-punctuation" />
        ) : (
          <Field label={`🤰 ${t('weeksField')}`} value={weeks} onChangeText={setWeeks} placeholder={`${t('eg')} 20`} keyboardType="decimal-pad" />
        )}
        {valid && ga && (
          <Row style={{ gap: 12, marginTop: 4 }}>
            <IconChip emoji="🤰" tone="pink" size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '900' }}>{weeksText(ga.weeks, ga.extra, lang)}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {t('hplLabel')}: {formatDate(ga.hpl, lang)}
              </Text>
            </View>
          </Row>
        )}
      </Card>
    </>
  );
}

/** The mother's height, education and which pregnancy this is. */
export function AboutMomCard({ height, setHeight, education, setEducation, gravida, setGravida }: { height: string; setHeight: (v: string) => void; education: string | null; setEducation: (v: string | null) => void; gravida: number | null; setGravida: (v: number | null) => void }) {
  const { t, lang } = useAuth();
  return (
    <Card>
      <Field label={`📏 ${t('heightMomField')}`} value={height} onChangeText={setHeight} placeholder={`${t('eg')} 152`} keyboardType="decimal-pad" />
      <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>🎓 {t('educationLbl')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {EDUCATION.map((e) => (
          <Chip key={e.key} label={e.label[lang]} selected={education === e.key} onPress={() => setEducation(education === e.key ? null : e.key)} />
        ))}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 }}>🤰 {t('whichPregnancy')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip key={n} label={n === 5 ? '5+' : String(n)} selected={gravida === n} onPress={() => setGravida(gravida === n ? null : n)} />
        ))}
      </View>
    </Card>
  );
}
