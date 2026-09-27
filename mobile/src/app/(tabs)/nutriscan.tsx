import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ChildPicker } from '../../components/ChildPicker';
import { MenuSuggestionsView } from '../../components/Recipes';
import { DiversityCard } from '../../components/Diversity';
import { Text } from '../../components/Text';
import { Bubble, Card, Empty, Loading, Row, Screen, Tile } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { groupsToday, mealStreak } from '../../lib/fun';
import type { Child, Meal, MenuSuggestions } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

export default function NutriScanTab() {
  const { t, lang } = useAuth();
  const children = useApi<Child[]>('/api/children');
  const { child: childParam } = useLocalSearchParams<{ child?: string }>();
  const [picked, setPicked] = useState<number | null>(null);
  const childId = picked ?? (childParam ? Number(childParam) : null) ?? children.data?.[0]?.id ?? null;
  const meals = useApi<Meal[]>(childId ? `/api/children/${childId}/meals?limit=100` : null);
  const [menus, setMenus] = useState<MenuSuggestions | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      setMenus(null);
      api<MenuSuggestions>(`/api/children/${childId}/menu-suggestions?lang=${lang}`, { body: {}, timeoutMs: 120000 })
        .then(setMenus)
        .catch(() => setMenus(null));
    }, [childId, lang]),
  );

  if (!children.data) return <Screen>{children.loading ? <Loading /> : null}</Screen>;
  if (!children.data.length)
    return (
      <Screen>
        <Empty text={t('addFirstChild')} />
      </Screen>
    );

  const go = (action: string) => router.push(`/child/${childId}/meal?action=${action}`);
  const today = groupsToday(meals.data ?? []);
  const streak = mealStreak(meals.data ?? []);

  return (
    <Screen refreshing={meals.loading} onRefresh={meals.reload}>
      <Bubble mood="cheer" tint={colors.primarySoft}>
        {t('scanHero')}
      </Bubble>
      <ChildPicker items={children.data} value={childId} onChange={setPicked} />

      <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Tile emoji="📷" title={t('takePhoto')} subtitle={t('scanHint')} onPress={() => go('camera')} color={0} />
        <Tile emoji="🖼️" title={t('choosePhoto')} subtitle="NutriScan AI" onPress={() => go('library')} color={3} />
        <Tile emoji="✍️" title={t('addFood')} subtitle={t('pickFoodsHint')} onPress={() => go('manual')} color={1} wide />
      </Row>

      <Card>
        <DiversityCard groups={today} />
        {streak > 0 && (
          <Text style={{ marginTop: 10, fontWeight: '800', color: colors.warn }}>
            🔥 {streak} {t('streak')}
          </Text>
        )}
      </Card>

      {menus ? <MenuSuggestionsView data={menus} /> : <Loading />}
    </Screen>
  );
}
