import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, initApi, setToken, setUnauthorizedHandler } from './api';
import { translate, TKey } from './i18n';
import { getJSON, setJSON } from './storage';
import type { Lang, User } from './types';

const LANG_KEY = 'nutrisense.lang';

interface AuthState {
  ready: boolean;
  user: User | null;
  lang: Lang;
  t: (key: TKey | string) => string;
  setLang: (lang: Lang) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (body: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<Lang>('id');

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    (async () => {
      setLangState(await getJSON<Lang>(LANG_KEY, 'id'));
      const token = await initApi();
      if (token) {
        try {
          const me = await api<User>('/api/auth/me');
          setUser(me);
          setLangState(me.language);
        } catch {
          await setToken(null);
        }
      }
      setReady(true);
    })();
  }, [logout]);

  const onAuth = useCallback(async (res: { access_token: string; user: User }) => {
    await setToken(res.access_token);
    setUser(res.user);
    setLangState(res.user.language);
    await setJSON(LANG_KEY, res.user.language);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      lang,
      t: (key) => translate(lang, key),
      setLang: async (l) => {
        setLangState(l);
        await setJSON(LANG_KEY, l);
        if (user) setUser(await api<User>('/api/auth/me', { method: 'PATCH', body: { language: l } }));
      },
      login: async (email, password) => onAuth(await api('/api/auth/login', { body: { email, password } })),
      register: async (body) => onAuth(await api('/api/auth/register', { body })),
      logout,
      refreshUser: async () => setUser(await api<User>('/api/auth/me')),
    }),
    [ready, user, lang, onAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isStaff = (u: User | null) => !!u && u.role !== 'caregiver';
export const isOversight = (u: User | null) => !!u && ['officer', 'doctor', 'admin'].includes(u.role);
