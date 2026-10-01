import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { onConnectivity } from './api';
import { flush, queued } from './offline';

interface SyncState {
  pending: number;
  syncing: boolean;
  /** Set for a few seconds after queued data reached the server. */
  justSynced: number;
  /** True when the last request could not reach the server. */
  offline: boolean;
  setOffline: (v: boolean) => void;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

/** Keeps the offline outbox moving: retries on app foreground and every 30 s while items are waiting. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => setPending((await queued()).length), []);

  const syncNow = useCallback(async () => {
    if (busy.current) return;
    const q = await queued();
    setPending(q.length);
    if (!q.length) return;
    busy.current = true;
    setSyncing(true);
    try {
      const r = await flush();
      setPending(r.remaining);
      setOffline(r.remaining > 0 && r.sent === 0);
      if (r.sent) {
        setJustSynced(r.sent);
        setTimeout(() => setJustSynced(0), 6000);
      }
    } catch {
      // keep items for the next attempt
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, []);

  const pendingRef = useRef(0);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    onConnectivity(setOffline);
    return () => onConnectivity(null);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void syncNow(), 0);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    const timer = setInterval(() => {
      if (pendingRef.current > 0) void syncNow();
    }, 30000);
    return () => {
      clearTimeout(first);
      sub.remove();
      clearInterval(timer);
    };
  }, [syncNow]);

  const value = useMemo(() => ({ pending, syncing, justSynced, offline, setOffline, refresh, syncNow }), [pending, syncing, justSynced, offline, refresh, syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
