import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Badge, Bar, Button, Card, ErrorBox, H2, Loading, P, Row, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { NUTRIENT_LABELS } from '../../../lib/i18n';
import type { NutritionPlan } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors } from '../../../theme';

export default function Nutrition() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const plan = useApi<NutritionPlan>(`/api/children/${id}/nutrition-plan`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      plan.setData(await api<NutritionPlan>(`/api/children/${id}/nutrition-plan?refresh=true`, { timeoutMs: 120000 }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const p = plan.data;
  if (!p) return <Screen>{plan.error ? <ErrorBox message={plan.error} onRetry={plan.reload} /> : <Loading />}</Screen>;
  const pct = p.intake.percent_of_need;

  return (
    <Screen refreshing={plan.loading} onRefresh={plan.reload}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primaryDark, flex: 1 }}>{p.headline}</Text>
          <Badge text={t(p.generated_by.startsWith('claude') ? 'aiBy_claude' : 'aiBy_rules')} fg={colors.info} bg={colors.infoSoft} />
        </Row>
        <P muted>{new Date(p.created_at).toLocaleDateString()}</P>
      </Card>
      {error && <ErrorBox message={error} />}

      <Card>
        <H2>{t('intakeVsNeed')}</H2>
        {pct ? (
          Object.entries(p.daily_targets).map(([k, target]) => (
            <View key={k} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>{NUTRIENT_LABELS[k]?.[lang] ?? k}</Text>
                <Text style={{ color: (pct[k] ?? 0) < 70 ? colors.warn : colors.muted, fontWeight: '600' }}>
                  {p.intake.average?.[k] ?? 0} / {target} {NUTRIENT_LABELS[k]?.unit} ({pct[k] ?? 0}%)
                </Text>
              </Row>
              <Bar pct={pct[k] ?? 0} />
            </View>
          ))
        ) : (
          <P muted>{t('logMeal')} →</P>
        )}
        {p.intake.dietary_diversity !== null && (
          <P style={{ marginTop: 6 }}>
            {t('diversity')}: <Text style={{ fontWeight: '700', color: p.intake.mdd_met ? colors.ok : colors.warn }}>{p.intake.dietary_diversity}</Text> / 8{' '}
            {t('groupsPerDay')}
          </P>
        )}
        <Button small variant="secondary" title={t('logMeal')} icon="camera-outline" onPress={() => router.push(`/child/${id}/meal`)} />
      </Card>

      {p.tips.length > 0 && (
        <Card>
          <H2>{t('tips')}</H2>
          {p.tips.map((tip) => (
            <P key={tip} style={{ marginBottom: 6 }}>
              • {tip}
            </P>
          ))}
        </Card>
      )}

      {p.meal_plan.length > 0 && (
        <Card>
          <H2>{t('mealPlan')}</H2>
          {p.meal_plan.map((m) => (
            <View key={m.meal} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '700', color: colors.primaryDark }}>{m.meal}</Text>
              <P>{m.menu}</P>
              <P muted style={{ fontSize: 13 }}>{m.why}</P>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <H2>{t('recipes')}</H2>
        {p.recipes.map((r) => (
          <View key={r.key} style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{r.name}</Text>
            <P muted style={{ fontSize: 12 }}>
              {r.min_age_months}+ {t('months')} · {r.targets.join(', ')}
            </P>
            <P>{r.steps}</P>
          </View>
        ))}
        <P muted>{p.priority_foods.map((f) => f.name).join(' · ')}</P>
      </Card>

      {p.cautions.length > 0 && (
        <Card style={{ backgroundColor: colors.warnSoft }}>
          <H2>{t('cautions')}</H2>
          {p.cautions.map((c) => (
            <P key={c}>• {c}</P>
          ))}
        </Card>
      )}
      <Button title={t('refresh')} variant="ghost" icon="refresh" onPress={regenerate} loading={busy} />
    </Screen>
  );
}
