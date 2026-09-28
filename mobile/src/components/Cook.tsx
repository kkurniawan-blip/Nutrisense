import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { FOOD_EMOJI } from '../lib/fun';
import { rupiah } from '../lib/nutriscan';
import type { KitchenRecipe, MenuIdea, Recipe } from '../lib/types';
import { colors, radius, statusColor } from '../theme';
import { Text } from './Text';
import { Button, Card, PressScale, Row } from './ui';

const emojis = (foods: string[]) => foods.filter((f) => f !== 'asi').map((f) => FOOD_EMOJI[f] ?? '🍽️').join(' ');

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: 15 }}>{text}</Text>
    </View>
  );
}

/** Time, what it costs to buy the missing foods, and from what age. */
function Facts({ recipe }: { recipe: KitchenRecipe }) {
  const { t, lang } = useAuth();
  return (
    <Row style={{ flexWrap: 'wrap', gap: 8 }}>
      <Pill text={`⏱ ${recipe.minutes} ${t('minutes')}`} bg="#ffffffd9" fg={colors.text} />
      <Pill
        text={recipe.need_cost_idr > 0 ? `🛒 ${t('buyAbout')} ${rupiah(recipe.need_cost_idr, lang)}` : `✓ ${t('allAtHome')}`}
        bg="#ffffffd9"
        fg={recipe.need_cost_idr > 0 ? colors.text : statusColor.ok.fg}
      />
      <Pill text={`👶 ${recipe.min_age_months}+ ${t('months')}`} bg="#ffffffd9" fg={colors.text} />
    </Row>
  );
}

/** Foods already at home and the few to buy, with an estimated price and where to get them. */
function HaveAndNeed({ recipe }: { recipe: KitchenRecipe }) {
  const { t, lang } = useAuth();
  return (
    <View style={{ gap: 10 }}>
      {recipe.have.length > 0 && (
        <View>
          <Text style={{ fontWeight: '900', fontSize: 17, marginBottom: 8 }}>✓ {t('alreadyHave')}</Text>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            {recipe.have.map((f) => (
              <Pill key={f.key} text={`${FOOD_EMOJI[f.key] ?? ''} ${f.name}`} bg={statusColor.ok.bg} fg={statusColor.ok.fg} />
            ))}
          </Row>
        </View>
      )}
      {recipe.need.length > 0 && (
        <View>
          <Text style={{ fontWeight: '900', fontSize: 17, marginBottom: 4 }}>🛒 {t('needToBuy')}</Text>
          {recipe.need.map((f) => (
            <Row key={f.key} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border, gap: 12 }}>
              <Text style={{ fontSize: 26 }}>{FOOD_EMOJI[f.key] ?? '🛒'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 17 }}>{f.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 15 }}>{f.where}</Text>
              </View>
              <Text style={{ fontWeight: '900', fontSize: 17, color: f.price_idr === 0 ? statusColor.ok.fg : colors.text }}>
                {f.price_idr === 0 ? t('free') : `± ${rupiah(f.price_idr, lang)}`}
              </Text>
            </Row>
          ))}
        </View>
      )}
    </View>
  );
}

/** The one recommended dish, big and clear, with a single next step. */
export function BestRecipeCard({ recipe, childName, onCook }: { recipe: KitchenRecipe; childName: string; onCook: () => void }) {
  const { t } = useAuth();
  return (
    <Card style={{ padding: 0, overflow: 'hidden', borderWidth: 3, borderColor: colors.mint }}>
      <View style={{ backgroundColor: colors.mintSoft, padding: 20, gap: 10 }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.mint, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
            ⭐ {t('bestFor')} {childName}
          </Text>
        </View>
        <Text style={{ fontSize: 36, letterSpacing: 2 }}>{emojis(recipe.foods)}</Text>
        <Text style={{ fontSize: 25, fontWeight: '900', color: colors.text, lineHeight: 31 }}>{recipe.name}</Text>
        <Facts recipe={recipe} />
      </View>
      <View style={{ padding: 20, gap: 16 }}>
        {recipe.highlights.length > 0 && (
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            {recipe.highlights.map((h) => (
              <Pill key={h} text={`💪 ${h}`} bg={colors.accentSoft} fg="#7A5200" />
            ))}
          </Row>
        )}
        {recipe.benefits.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: '900', fontSize: 17 }}>{t('whyGood')}</Text>
            {recipe.benefits.map((b) => (
              <Row key={b.key} style={{ alignItems: 'flex-start', gap: 10 }}>
                <Text style={{ fontSize: 22 }}>{FOOD_EMOJI[b.key] ?? '✨'}</Text>
                <Text style={{ flex: 1, fontSize: 17, lineHeight: 25 }}>{b.text}</Text>
              </Row>
            ))}
          </View>
        )}
        <HaveAndNeed recipe={recipe} />
        <Button title={`👩‍🍳 ${t('seeHowToCook')}`} onPress={onCook} />
      </View>
    </Card>
  );
}

/** Another good choice: compact, but still easy to read and tap. */
export function RecipeOptionCard({ recipe, onPress }: { recipe: KitchenRecipe; onPress: () => void }) {
  const { t, lang } = useAuth();
  return (
    <PressScale onPress={onPress} accessibilityRole="button" style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: colors.border, gap: 6 }}>
      <Text style={{ fontSize: 28 }}>{emojis(recipe.foods)}</Text>
      <Text style={{ fontSize: 20, fontWeight: '900' }}>{recipe.name}</Text>
      <Text style={{ fontSize: 16, color: colors.muted }}>
        ⏱ {recipe.minutes} {t('minutes')} · {recipe.need_cost_idr > 0 ? `🛒 ${t('buyAbout')} ${rupiah(recipe.need_cost_idr, lang)}` : `✓ ${t('allAtHome')}`}
      </Text>
      {recipe.highlights[0] ? <Text style={{ fontSize: 16, fontWeight: '800', color: '#7A5200' }}>💪 {recipe.highlights.join(' · ')}</Text> : null}
      <Text style={{ fontSize: 17, fontWeight: '900', color: colors.primaryDark, marginTop: 4 }}>{t('seeRecipe')} ›</Text>
    </PressScale>
  );
}

/** Step-by-step cooking view: ingredients, then one big numbered step at a time. */
export function CookView({ recipe }: { recipe: KitchenRecipe | Recipe | MenuIdea }) {
  const { t } = useAuth();
  const kitchen = 'need' in recipe ? (recipe as KitchenRecipe) : null;
  const foods = 'foods' in recipe ? recipe.foods : [];
  return (
    <View>
      <Card tint={colors.mintSoft}>
        {foods.length > 0 && <Text style={{ fontSize: 36, letterSpacing: 2 }}>{emojis(foods)}</Text>}
        <Text style={{ fontSize: 25, fontWeight: '900', lineHeight: 31, marginTop: 6 }}>{recipe.name}</Text>
        {kitchen ? (
          <View style={{ marginTop: 12 }}>
            <Facts recipe={kitchen} />
          </View>
        ) : (
          <Text style={{ fontSize: 16, color: colors.muted, marginTop: 6 }}>
            ⏱ {recipe.minutes} {t('minutes')}
          </Text>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 21, fontWeight: '900', marginBottom: 12 }}>🧺 {t('ingredients')}</Text>
        {recipe.ingredients.map((i) => (
          <Row key={i} style={{ alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mint, marginTop: 9 }} />
            <Text style={{ flex: 1, fontSize: 18, lineHeight: 27 }}>{i}</Text>
          </Row>
        ))}
        {kitchen && (kitchen.have.length > 0 || kitchen.need.length > 0) && (
          <View style={{ marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderColor: colors.border }}>
            <HaveAndNeed recipe={kitchen} />
          </View>
        )}
      </Card>

      <Text style={{ fontSize: 21, fontWeight: '900', marginBottom: 12, marginTop: 4 }}>👩‍🍳 {t('howTo')}</Text>
      {recipe.steps.map((s, i) => (
        <Card key={s}>
          <Row style={{ alignItems: 'flex-start', gap: 14 }}>
            <View style={{ backgroundColor: colors.ink, width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 19 }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 18, lineHeight: 27 }}>{s}</Text>
          </Row>
        </Card>
      ))}

      <Card tint={colors.accentSoft}>
        <Text style={{ fontSize: 17, lineHeight: 25, fontWeight: '700' }}>🧼 {t('cookTips')}</Text>
      </Card>
    </View>
  );
}
