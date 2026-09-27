import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { RecipeCard } from '../../../components/Recipes';
import { Text } from '../../../components/Text';
import { Badge, Bar, Bubble, Button, Card, ErrorBox, H2, Loading, Row, Screen } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { FOOD_EMOJI, NUTRIENT_EMOJI } from '../../../lib/fun';
import { NUTRIENT_LABELS } from '../../../lib/i18n';
import type { NutritionPlan } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { colors, radius } from '../../../theme';

const MEAL_EMOJI = ['🌅', '🍎', '☀️', '🍌', '🌙'];

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
      <Card tint={colors.mintSoft}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ok, flex: 1 }}>🥗 {p.headline}</Text>
          <Badge text={t(p.generated_by.startsWith('claude') ? 'aiBy_claude' : 'aiBy_rules')} fg={colors.info} bg="#fff" />
        </Row>
        <Text style={{ color: colors.muted }}>{new Date(p.created_at).toLocaleDateString()}</Text>
      </Card>
      {error && <ErrorBox message={error} />}

      <Card>
        <H2 emoji="📊">{t('intakeVsNeed')}</H2>
        {pct ? (
          Object.entries(p.daily_targets).map(([k, target]) => (
            <View key={k} style={{ marginBottom: 10 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontWeight: '700' }}>
                  {NUTRIENT_EMOJI[k]} {NUTRIENT_LABELS[k]?.[lang] ?? k}
                </Text>
                <Text style={{ color: (pct[k] ?? 0) < 70 ? colors.warn : colors.ok, fontWeight: '800' }}>{pct[k] ?? 0}%</Text>
              </Row>
              <Bar pct={pct[k] ?? 0} />
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {p.intake.average?.[k] ?? 0} / {target} {NUTRIENT_LABELS[k]?.unit}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.muted }}>{t('pickFoodsHint')}</Text>
        )}
        {p.intake.dietary_diversity !== null && (
          <Text style={{ marginTop: 4 }}>
            🌈 {t('diversity')}: <Text style={{ fontWeight: '900', color: p.intake.mdd_met ? colors.ok : colors.warn }}>{p.intake.dietary_diversity}</Text> / 8 {t('groupsPerDay')}
          </Text>
        )}
        <Button small variant="secondary" title={t('logMeal')} icon="camera" onPress={() => router.push(`/child/${id}/meal?action=camera`)} />
      </Card>

      {p.priority_foods.length > 0 && (
        <Card>
          <H2 emoji="🛒">{t('easyCheap')}</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {p.priority_foods.map((f) => (
              <View key={f.key} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontWeight: '700' }}>
                  {FOOD_EMOJI[f.key] ?? '🍽️'} {f.name}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {p.tips.length > 0 && (
        <Bubble mood="happy" tint={colors.lavenderSoft}>
          <View>
            <Text style={{ fontWeight: '900', marginBottom: 4 }}>💡 {t('tips')}</Text>
            {p.tips.map((tip) => (
              <Text key={tip} style={{ marginBottom: 6, lineHeight: 21 }}>
                • {tip}
              </Text>
            ))}
          </View>
        </Bubble>
      )}

      {p.meal_plan.length > 0 && (
        <Card>
          <H2 emoji="🗓️">{t('mealPlan')}</H2>
          {p.meal_plan.map((m, i) => (
            <Row key={m.meal} style={{ alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{MEAL_EMOJI[i % MEAL_EMOJI.length]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', color: colors.primaryDark }}>{m.meal}</Text>
                <Text>{m.menu}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{m.why}</Text>
              </View>
            </Row>
          ))}
        </Card>
      )}

      <H2 emoji="👩‍🍳">{t('recipes')}</H2>
      {p.recipes.map((r, i) => (
        <RecipeCard key={r.key} recipe={r} index={i} />
      ))}

      {p.cautions.length > 0 && (
        <Card tint={colors.warnSoft}>
          <H2 emoji="⚠️">{t('cautions')}</H2>
          {p.cautions.map((c) => (
            <Text key={c}>• {c}</Text>
          ))}
        </Card>
      )}
      <Button title={t('refresh')} variant="ghost" icon="refresh" onPress={regenerate} loading={busy} />
    </Screen>
  );
}
