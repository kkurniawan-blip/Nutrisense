import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, errorText, NetworkError } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getJSON, setJSON } from './storage';

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
