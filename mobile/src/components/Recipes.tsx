import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { FOOD_EMOJI, FOOD_GROUPS } from '../lib/fun';
import type { MenuIdea, MenuSuggestions, Recipe } from '../lib/types';
import { colors, radius, tilePalette } from '../theme';
import { Badge, Bubble, Card, H2, Row } from './ui';
import { Text } from './Text';

function Steps({ ingredients, steps }: { ingredients: string[]; steps: string[] }) {
  const { t } = useAuth();
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontWeight: '900', fontSize: 18, marginBottom: 6 }}>🧺 {t('ingredients')}</Text>
      {ingredients.map((i) => (
        <Text key={i} style={{ color: colors.text, marginLeft: 6, fontSize: 17, lineHeight: 26 }}>
          • {i}
        </Text>
      ))}
      <Text style={{ fontWeight: '900', fontSize: 18, marginTop: 14, marginBottom: 8 }}>👩‍🍳 {t('howTo')}</Text>
      {steps.map((s, i) => (
        <Row key={s} style={{ alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
          <View style={{ backgroundColor: colors.ink, width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{i + 1}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 17, lineHeight: 26 }}>{s}</Text>
        </Row>
      ))}
    </View>
  );
}

/** Colourful recipe card: time, cost and age at a glance; tap to open ingredients and steps. */
export function RecipeCard({ recipe, index = 0 }: { recipe: Recipe; index?: number }) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  const p = tilePalette[index % tilePalette.length];
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen(!open)}>
        <View style={{ backgroundColor: p.bg, padding: 18 }}>
          <Text style={{ fontSize: 30, letterSpacing: 4 }}>{recipe.foods.map((f) => FOOD_EMOJI[f] ?? '🍽️').join('')}</Text>
          <Text style={{ fontSize: 21, fontWeight: '900', color: p.fg, marginTop: 6, lineHeight: 27 }}>{recipe.name}</Text>
          <Row style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <Badge text={`⏱ ${recipe.minutes} ${t('minutes')}`} fg={colors.text} bg="#ffffffcc" />
            <Badge text={`💰 ${recipe.cost_label}`} fg={colors.text} bg="#ffffffcc" />
            <Badge text={`👶 ${recipe.min_age_months}+ ${t('months')}`} fg={colors.text} bg="#ffffffcc" />
          </Row>
        </View>
        <View style={{ padding: 18 }}>
          {recipe.why ? <Text style={{ color: colors.ok, fontWeight: '700', marginBottom: 6, fontSize: 16 }}>✨ {recipe.why}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 16 }}>💪 {recipe.targets.join(' · ')}</Text>
          {open && <Steps ingredients={recipe.ingredients} steps={recipe.steps} />}
          <Text style={{ color: colors.primaryDark, fontWeight: '900', fontSize: 17, marginTop: 12 }}>{open ? `▲ ${t('hideRecipe')}` : `▼ ${t('showRecipe')}`}</Text>
        </View>
      </Pressable>
    </Card>
  );
}

function IdeaCard({ idea }: { idea: MenuIdea }) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <Card tint={colors.lavenderSoft} onPress={() => setOpen(!open)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '900', fontSize: 16, color: colors.lavender, flex: 1 }}>✨ {idea.name}</Text>
        <Badge text={`⏱ ${idea.minutes} ${t('minutes')}`} fg={colors.text} bg="#fff" />
      </Row>
      <Text style={{ marginTop: 4 }}>{idea.why}</Text>
      {open ? <Steps ingredients={idea.ingredients} steps={idea.steps} /> : <Text style={{ color: colors.lavender, fontWeight: '800', marginTop: 6 }}>▼ {t('showRecipe')}</Text>}
    </Card>
  );
}

/** The NutriScan menu suggester: what's missing from today's plate + easy dishes to fill it. */
export function MenuSuggestionsView({ data }: { data: MenuSuggestions }) {
  const { t, lang } = useAuth();
  if (data.note) return <Bubble>{data.note}</Bubble>;
  const missing = data.missing_groups;
  return (
    <View>
      <Bubble mood={missing.length ? 'thinking' : 'cheer'} tint={missing.length ? colors.accentSoft : colors.mintSoft}>
        {missing.length ? (
          <View>
            <Text style={{ fontWeight: '700', marginBottom: 6 }}>{t('stillMissing')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {missing.map((g) => {
                const meta = FOOD_GROUPS.find((x) => x.key === g.key);
                return (
                  <View key={g.key} style={{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: meta?.color ?? colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '700' }}>
                      {meta?.emoji} {meta ? meta[lang] : g.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          t('plateComplete')
        )}
      </Bubble>
      <H2 emoji="🍳">{t('nextMealIdeas')}</H2>
      <Text style={{ color: colors.muted, marginTop: -6, marginBottom: 10 }}>{t('easyCheap')}</Text>
      {data.suggestions.map((r, i) => (
        <RecipeCard key={r.key} recipe={r} index={i + 1} />
      ))}
      {data.ai_ideas.length > 0 && (
        <>
          <H2 emoji="🤖">{t('nuriIdeas')}</H2>
          {data.ai_ideas.map((idea) => (
            <IdeaCard key={idea.name} idea={idea} />
          ))}
        </>
      )}
    </View>
  );
}
