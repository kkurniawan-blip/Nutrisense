import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, errorText, NetworkError } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getJSON, setJSON } from './storage';
import type { Lang, User } from './types';

const CACHE_PREFIX = 'nutrisense.cache:';

/**
 * Loads `path` whenever the screen gains focus (or the path changes); exposes reload for pull-to-refresh.
 * Every successful response is cached on the phone, so profiles, checklists and recommendations that
 * were opened before still show (marked `stale`) when there is no signal.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await api<T>(path);
      setData(fresh);
      setStale(false);
      void setJSON(CACHE_PREFIX + path, fresh).catch(() => undefined);
    } catch (e) {
      const cached = e instanceof NetworkError ? await getJSON<T | null>(CACHE_PREFIX + path, null) : null;
      if (cached !== null) {
        setData(cached);
        setStale(true);
      } else setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, error, loading, stale, reload, setData };
}

/** Removes every cached API response from the phone (on logout, or from Settings). */
export async function clearApiCache(): Promise<number> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
  return keys.length;
}

let lastPrefetch = { key: '', at: 0 };

/**
 * Saves on the phone what each role needs most, so those screens work with no signal even if they were
 * never opened: the food list, every child (and, for mothers, their history, KIA and meals), pregnancies,
 * and the Kader's active cases. Runs in the background at most every 10 minutes; failures are ignored.
 */
export async function prefetchForOffline(user: User, lang: Lang): Promise<void> {
  const key = `${user.id}:${lang}`;
  if (lastPrefetch.key === key && Date.now() - lastPrefetch.at < 10 * 60 * 1000) return;
  lastPrefetch = { key, at: Date.now() };
  const save = async <T,>(path: string): Promise<T | null> => {
    try {
      const data = await api<T>(path);
      await setJSON(CACHE_PREFIX + path, data);
      return data;
    } catch {
      return null;
    }
  };
  const mother = user.role === 'caregiver';
  const [children, pregnancies, , , cases] = await Promise.all([
    save<{ id: number }[]>('/api/children'),
    save<{ id: number }[]>('/api/pregnancies'),
    save(`/api/foods?lang=${lang}`),
    save('/api/local'),
    mother ? null : save<{ id: number }[]>('/api/cases?status_filter=open,in_progress,referred'),
  ]);
  const paths: string[] = [];
  // Officers and doctors see the whole province online; only mothers and Kader need every child offline.
  for (const c of mother || user.role === 'kader' ? children ?? [] : []) {
    paths.push(`/api/children/${c.id}`, `/api/children/${c.id}/measurements`);
    if (mother) paths.push(`/api/children/${c.id}/growth-chart?indicator=hfa`, `/api/children/${c.id}/kia`, `/api/children/${c.id}/meals?limit=100`);
  }
  for (const p of pregnancies ?? []) paths.push(`/api/pregnancies/${p.id}`, `/api/pregnancies/${p.id}/link`);
  for (const k of cases ?? []) paths.push(`/api/cases/${k.id}`);
  // A few at a time, so a weak connection is not flooded.
  for (let i = 0; i < paths.length; i += 4) await Promise.all(paths.slice(i, i + 4).map((p) => save(p)));
}
