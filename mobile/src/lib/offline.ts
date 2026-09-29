/**
 * Offline-first outbox. Everything a mother or Kader records without a signal (child and mother
 * measurements, meals, symptoms, ANC visits, TTD/PMT, ASI, KIA) is kept on the phone with a client
 * UUID and replayed when the connection returns. The server de-duplicates by UUID or by day, so a
 * retry can never create a double entry. A short history of sent and rejected items backs the
 * sync status page, so nothing disappears silently.
 */
import { api, ApiError, errorText, NetworkError } from './api';
import { getJSON, setJSON } from './storage';

const QUEUE_KEY = 'nutrisense.offlineQueue';
const HISTORY_KEY = 'nutrisense.syncHistory';

export type OutboxKind = 'measurement' | 'meal' | 'symptom' | 'mother_measurement' | 'anc' | 'daily' | 'asi' | 'kia';

export interface OutboxItem {
  kind: OutboxKind;
  /** The child's id, or the pregnancy's id for the mother's entries. */
  child_id: number;
  /** Shown in the sync status list: the child's or the mother's name. */
  child_name: string;
  client_uuid: string;
  body: Record<string, unknown>;
  queued_at: string;
  /** Endpoint for the kinds that are not child measurements, meals or symptoms. */
  path?: string;
}

export interface SyncHistoryItem {
  kind: OutboxKind;
  child_name: string;
  queued_at: string;
  done_at: string;
  status: 'sent' | 'rejected';
  error?: string;
}

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Reads the queue; items saved by older app versions (bare measurements) are upgraded in place. */
export async function queued(): Promise<OutboxItem[]> {
  const raw = await getJSON<any[]>(QUEUE_KEY, []);
  return raw.map((x) =>
    x.kind
      ? x
      : { kind: 'measurement', child_id: x.child_id, child_name: x.child_name, client_uuid: x.client_uuid, body: x, queued_at: new Date().toISOString() },
  );
}

export async function enqueue(kind: OutboxKind, childId: number, childName: string, body: Record<string, unknown>, path?: string): Promise<number> {
  const q = await queued();
  const client_uuid = (body.client_uuid as string) ?? uuid();
  q.push({ kind, child_id: childId, child_name: childName, client_uuid, body: { ...body, client_uuid }, queued_at: new Date().toISOString(), path });
  await setJSON(QUEUE_KEY, q);
  return q.length;
}

export async function history(): Promise<SyncHistoryItem[]> {
  return getJSON<SyncHistoryItem[]>(HISTORY_KEY, []);
}

async function remember(items: SyncHistoryItem[]): Promise<void> {
  if (!items.length) return;
  const h = await history();
  await setJSON(HISTORY_KEY, [...items, ...h].slice(0, 30));
}

/**
 * Save now, or keep it on the phone when there is no signal. Returns the server's answer, or null when queued.
 * Used by the entry screens so every form works offline the same way.
 */
export async function saveOrQueue<T>(kind: OutboxKind, id: number, name: string, path: string, body: Record<string, unknown>): Promise<T | null> {
  const withId = { ...body, client_uuid: (body.client_uuid as string) ?? uuid() };
  try {
    return await api<T>(path, { body: withId });
  } catch (e) {
    if (e instanceof NetworkError) {
      await enqueue(kind, id, name, withId, path);
      return null;
    }
    throw e;
  }
}

function pathFor(item: OutboxItem): string {
  if (item.path) return item.path;
  return item.kind === 'meal' ? `/api/children/${item.child_id}/meals` : `/api/children/${item.child_id}/symptoms`;
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

export async function flush(): Promise<FlushResult> {
  const q = await queued();
  if (!q.length) return { sent: 0, failed: 0, remaining: 0 };
  let sent = 0;
  let failed = 0;
  const keep: OutboxItem[] = [];
  const log: SyncHistoryItem[] = [];
  const done = (i: OutboxItem, status: 'sent' | 'rejected', error?: string) =>
    log.push({ kind: i.kind, child_name: i.child_name, queued_at: i.queued_at, done_at: new Date().toISOString(), status, error });

  const measurements = q.filter((i) => i.kind === 'measurement');
  if (measurements.length) {
    try {
      const res = await api<{ results: { status: string; client_uuid: string; detail?: unknown }[] }>('/api/sync', {
        body: { measurements: measurements.map((m) => ({ ...m.body, child_id: m.child_id })) },
      });
      for (const m of measurements) {
        const r = res.results.find((x) => x.client_uuid === m.client_uuid);
        if (r?.status === 'error') {
          failed += 1;
          done(m, 'rejected', typeof r.detail === 'string' ? r.detail : undefined);
        } else {
          sent += 1;
          done(m, 'sent');
        }
      }
    } catch (e) {
      if (e instanceof NetworkError) return { sent: 0, failed: 0, remaining: q.length };
      throw e;
    }
  }

  for (const item of q.filter((i) => i.kind !== 'measurement')) {
    try {
      await api(pathFor(item), { body: item.body, timeoutMs: 120000 });
      sent += 1;
      done(item, 'sent');
    } catch (e) {
      if (e instanceof ApiError) {
        failed += 1; // rejected by the server (e.g. invalid): drop so it cannot block the queue, but show it
        done(item, 'rejected', errorText(e));
      } else keep.push(item);
    }
  }
  await setJSON(QUEUE_KEY, keep);
  await remember(log);
  return { sent, failed, remaining: keep.length };
}

/** Drops everything waiting to be sent (used when signing out, so data never goes out under another account). */
export async function clearQueue(): Promise<void> {
  await setJSON(QUEUE_KEY, []);
}
