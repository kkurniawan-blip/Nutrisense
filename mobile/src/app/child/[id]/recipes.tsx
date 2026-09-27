import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { RecipeCard } from '../../../components/Recipes';
import { Bubble, ErrorBox, Loading, Screen } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import type { Recipe } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';

/** Every easy, low-cost recipe that suits the child's age, quickest first. */
export default function Recipes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useAuth();
  const list = useApi<Recipe[]>(`/api/children/${id}/recipes`);
  return (
    <Screen refreshing={list.loading} onRefresh={list.reload}>
      <Bubble mood="cheer">{t('easyCheap')}</Bubble>
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!list.data && <Loading />}
      {list.data?.map((r, i) => (
        <RecipeCard key={r.key} recipe={r} index={i} />
      ))}
    </Screen>
  );
}
