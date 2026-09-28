import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { FOOD_EMOJI } from '../lib/fun';
import { rupiah } from '../lib/nutriscan';
import type { KitchenRecipe, MenuIdea, Recipe } from '../lib/types';
import { colors, radius, statusColor, tones } from '../theme';
import { Text } from './Text';
import { Button, Card, H2, MoreLink, PressScale, Row } from './ui';

const emojis = (foods: string[]) => foods.filter((f) => f !== 'asi').map((f) => FOOD_EMOJI[f] ?? '🍽️').join(' ');

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: 15 }}>{text}</Text>
    </View>
  );
}

/** Foods already at home and the few to buy, with an estimated price and where to get them. */
function HaveAndNeed({ recipe }: { recipe: KitchenRecipe }) {
  const { t, lang } = useAuth();
  return (
    <View style={{ gap: 10 }}>
      {recipe.have.length > 0 && (
        <View>
          <Text style={{ fontWeight: '700', fontSize: 14, color: colors.muted, marginBottom: 8 }}>✓ {t('alreadyHave')}</Text>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            {recipe.have.map((f) => (
              <Pill key={f.key} text={`${FOOD_EMOJI[f.key] ?? ''} ${f.name}`} bg={statusColor.ok.bg} fg={statusColor.ok.fg} />
            ))}
          </Row>
        </View>
      )}
      {recipe.need.length > 0 && (
        <View>
          <Text style={{ fontWeight: '700', fontSize: 14, color: colors.muted, marginBottom: 4 }}>🛒 {t('needToBuy')}</Text>
          {recipe.need.map((f) => (
            <Row key={f.key} style={{ paddingVertical: 8, gap: 12 }}>
              <Text style={{ fontSize: 24 }}>{FOOD_EMOJI[f.key] ?? '🛒'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 15 }}>{f.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{f.where}</Text>
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

/** Time and age in one quiet line. */
function Meta({ recipe }: { recipe: KitchenRecipe | Recipe | MenuIdea }) {
  const { t } = useAuth();
  const age = 'min_age_months' in recipe ? ` · ${recipe.min_age_months}+ ${t('months')}` : '';
  return (
    <Text style={{ color: colors.muted, fontSize: 14 }}>
      ⏱ {recipe.minutes} {t('minutes')}
      {age}
    </Text>
  );
}

/** "Everything is at home", or the estimated cost of what is missing. */
function Availability({ recipe }: { recipe: KitchenRecipe }) {
  const { t, lang } = useAuth();
  const all = recipe.need_cost_idr <= 0 && recipe.need.every((f) => f.price_idr === 0);
  return all || recipe.need.length === 0 ? (
    <Pill text={`✓ ${t('allAtHome')}`} bg={statusColor.ok.bg} fg={statusColor.ok.fg} />
  ) : (
    <Pill text={`🛒 ${t('buyAbout')} ${rupiah(recipe.need_cost_idr, lang)}`} bg="#ffffffcc" fg={colors.text} />
  );
}

/** The one recommended dish: name, time and age, what it needs, three small benefit tags, one action. */
export function BestRecipeCard({ recipe, childName, onCook }: { recipe: KitchenRecipe; childName: string; onCook: () => void }) {
  const { t } = useAuth();
  const [why, setWhy] = useState(false);
  return (
    <Card style={{ padding: 0, overflow: 'hidden', borderWidth: 2, borderColor: colors.mint }}>
      <View style={{ backgroundColor: 'rgba(230,246,238,0.9)', padding: 20, gap: 8 }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.mint, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
            ⭐ {t('bestFor')} {childName}
          </Text>
        </View>
        <Text style={{ fontSize: 32, letterSpacing: 2 }}>{emojis(recipe.foods)}</Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text, lineHeight: 28 }}>{recipe.name}</Text>
        <Meta recipe={recipe} />
        <Row style={{ marginTop: 2 }}>
          <Availability recipe={recipe} />
        </Row>
      </View>
      <View style={{ padding: 20, paddingTop: 16, gap: 12 }}>
        {recipe.highlights.length > 0 && (
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {recipe.highlights.map((h) => (
              <Pill key={h} text={h} bg={tones.yellow.bg} fg={tones.yellow.fg} />
            ))}
          </Row>
        )}
        {recipe.benefits.length > 0 && <MoreLink label={t('whyGood')} open={why} onPress={() => setWhy(!why)} />}
        {why && (
          <View style={{ gap: 8, marginTop: -4 }}>
            {recipe.benefits.map((b) => (
              <Row key={b.key} style={{ alignItems: 'flex-start', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>{FOOD_EMOJI[b.key] ?? '✨'}</Text>
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{b.text}</Text>
              </Row>
            ))}
          </View>
        )}
        <Button title={t('seeRecipe')} icon="arrow-forward" onPress={onCook} />
      </View>
    </Card>
  );
}

/** Another good choice: compact, but still easy to read and tap. */
export function RecipeOptionCard({ recipe, onPress }: { recipe: KitchenRecipe; onPress: () => void }) {
  const { t, lang } = useAuth();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${t('seeRecipe')}`}
      style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontSize: 26 }}>{emojis(recipe.foods)}</Text>
        <Text style={{ fontSize: 19, fontWeight: '900' }}>{recipe.name}</Text>
        <Text style={{ fontSize: 15, color: colors.muted }}>
          ⏱ {recipe.minutes} {t('minutes')} · {recipe.need_cost_idr > 0 ? `🛒 ${rupiah(recipe.need_cost_idr, lang)}` : `✓ ${t('allAtHome')}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.primary} />
    </PressScale>
  );
}

/** A step's first clause is its short headline; any detail after the first comma is quieter. */
function StepText({ text }: { text: string }) {
  const i = text.search(/[,;]/);
  const head = i > 0 && i < text.length - 1 ? text.slice(0, i) : text.replace(/\.$/, '');
  const rest = i > 0 && i < text.length - 1 ? text.slice(i + 1).trim().replace(/\.$/, '') : '';
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', lineHeight: 22 }}>{head}</Text>
      {rest ? <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>{rest}</Text> : null}
    </View>
  );
}

/** Recipe page: name, time and age, ingredients, then short numbered steps, all in two light cards. */
export function CookView({ recipe }: { recipe: KitchenRecipe | Recipe | MenuIdea }) {
  const { t } = useAuth();
  const kitchen = 'need' in recipe ? (recipe as KitchenRecipe) : null;
  const foods = 'foods' in recipe ? recipe.foods : [];
  return (
    <View>
      <View style={{ marginBottom: 16, gap: 4 }}>
        {foods.length > 0 && <Text style={{ fontSize: 34, letterSpacing: 2 }}>{emojis(foods)}</Text>}
        <Text style={{ fontSize: 22, fontWeight: '900', lineHeight: 28 }}>{recipe.name}</Text>
        <Meta recipe={recipe} />
      </View>

      <Card>
        <H2>{t('ingredients')}</H2>
        {recipe.ingredients.map((i) => (
          <Row key={i} style={{ alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mint, marginTop: 8 }} />
            <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{i}</Text>
          </Row>
        ))}
        {kitchen && (kitchen.have.length > 0 || kitchen.need.length > 0) && (
          <View style={{ marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderColor: colors.line }}>
            <HaveAndNeed recipe={kitchen} />
          </View>
        )}
      </Card>

      <Card>
        <H2>{t('howTo')}</H2>
        {recipe.steps.map((s, i) => (
          <Row key={s} style={{ alignItems: 'flex-start', gap: 12, marginBottom: i < recipe.steps.length - 1 ? 14 : 0 }}>
            <View style={{ backgroundColor: colors.primary, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{i + 1}</Text>
            </View>
            <StepText text={s} />
          </Row>
        ))}
      </Card>
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>🧼 {t('cookTips')}</Text>
    </View>
  );
}
