import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, initApi, NetworkError, setToken, setUnauthorizedHandler } from './api';
import { translate, TKey } from './i18n';
import { clearQueue } from './offline';
import { getJSON, setJSON } from './storage';
import { clearApiCache } from './useApi';
import type { Lang, User } from './types';

const LANG_KEY = 'nutrisense.lang';
/** Which account the offline outbox belongs to, so queued data is never sent under someone else's login. */
const OWNER_KEY = 'nutrisense.outboxOwner';
/** The last known profile, so the app opens (and records offline) without a signal. */
const USER_KEY = 'nutrisense.user';
/** A language chosen on the login screen, before anyone is logged in: it wins over the account's saved one. */
const PICKED_KEY = 'nutrisense.langPicked';

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
  updateMe: (body: Partial<Pick<User, 'full_name' | 'phone' | 'region_id' | 'language'>>) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<Lang>('id');

  // Session expired: sign out but keep queued data, the same person usually logs straight back in.
  const expire = useCallback(async () => {
    await setToken(null);
    await setJSON(USER_KEY, null);
    setUser(null);
  }, []);

  // Explicit sign-out: a shared family phone must not show (or send) this account's data afterwards.
  const logout = useCallback(async () => {
    await expire();
    await Promise.all([clearApiCache(), clearQueue()]).catch(() => undefined);
  }, [expire]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void expire();
    });
    (async () => {
      setLangState(await getJSON<Lang>(LANG_KEY, 'id'));
      const token = await initApi();
      if (token) {
        try {
          const me = await api<User>('/api/auth/me');
          if ((await getJSON<number | null>(OWNER_KEY, null)) === null) await setJSON(OWNER_KEY, me.id);
          await setJSON(USER_KEY, me);
          setUser(me);
          setLangState(me.language);
        } catch (e) {
          // No signal: stay logged in with the saved profile; entries go to the offline outbox.
          const saved = e instanceof NetworkError ? await getJSON<User | null>(USER_KEY, null) : null;
          if (saved) {
            setUser(saved);
            setLangState(saved.language);
          } else await setToken(null);
        }
      }
      setReady(true);
    })();
  }, [expire]);

  const onAuth = useCallback(async (res: { access_token: string; user: User }) => {
    const owner = await getJSON<number | null>(OWNER_KEY, null);
    if (owner !== res.user.id) {
      // A different account on this phone: drop the previous account's cache and unsent data.
      await Promise.all([clearApiCache(), clearQueue()]).catch(() => undefined);
      await setJSON(OWNER_KEY, res.user.id);
    }
    await setToken(res.access_token);
    let me = res.user;
    const picked = await getJSON<Lang | null>(PICKED_KEY, null);
    if (picked && picked !== me.language) {
      me = await api<User>('/api/auth/me', { method: 'PATCH', body: { language: picked } }).catch(() => ({ ...me, language: picked }));
    }
    await setJSON(PICKED_KEY, null);
    await setJSON(USER_KEY, me);
    setUser(me);
    setLangState(me.language);
    await setJSON(LANG_KEY, me.language);
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
        else await setJSON(PICKED_KEY, l);
      },
      login: async (email, password) => onAuth(await api('/api/auth/login', { body: { email, password } })),
      register: async (body) => onAuth(await api('/api/auth/register', { body })),
      logout,
      refreshUser: async () => setUser(await api<User>('/api/auth/me')),
      updateMe: async (body) => {
        const me = await api<User>('/api/auth/me', { method: 'PATCH', body });
        setUser(me);
        if (me.language !== lang) {
          setLangState(me.language);
          await setJSON(LANG_KEY, me.language);
        }
      },
      changePassword: async (current, next) => {
        await api('/api/auth/change-password', { body: { current_password: current, new_password: next } });
      },
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
