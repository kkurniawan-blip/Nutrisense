/**
 * Offline-first outbox. Measurements, meals and symptom reports recorded without a signal are
 * kept on the phone with a client UUID and replayed when the connection returns; the server
 * de-duplicates by UUID, so a retry can never create a double entry.
 */
import { api, ApiError, NetworkError } from './api';
import { getJSON, setJSON } from './storage';

const QUEUE_KEY = 'nutrisense.offlineQueue';

export type OutboxKind = 'measurement' | 'meal' | 'symptom';

export interface OutboxItem {
  kind: OutboxKind;
  child_id: number;
  child_name: string;
  client_uuid: string;
  body: Record<string, unknown>;
  queued_at: string;
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

export async function enqueue(kind: OutboxKind, childId: number, childName: string, body: Record<string, unknown>): Promise<number> {
  const q = await queued();
  const client_uuid = (body.client_uuid as string) ?? uuid();
  q.push({ kind, child_id: childId, child_name: childName, client_uuid, body: { ...body, client_uuid }, queued_at: new Date().toISOString() });
  await setJSON(QUEUE_KEY, q);
  return q.length;
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

  const measurements = q.filter((i) => i.kind === 'measurement');
  if (measurements.length) {
    try {
      const res = await api<{ results: { status: string }[] }>('/api/sync', {
        body: { measurements: measurements.map((m) => ({ ...m.body, child_id: m.child_id })) },
      });
      sent += res.results.filter((r) => r.status !== 'error').length;
      failed += res.results.filter((r) => r.status === 'error').length;
    } catch (e) {
      if (e instanceof NetworkError) return { sent: 0, failed: 0, remaining: q.length };
      throw e;
    }
  }

  for (const item of q.filter((i) => i.kind !== 'measurement')) {
    const path = item.kind === 'meal' ? `/api/children/${item.child_id}/meals` : `/api/children/${item.child_id}/symptoms`;
    try {
      await api(path, { body: item.body, timeoutMs: 120000 });
      sent += 1;
    } catch (e) {
      if (e instanceof NetworkError) keep.push(item);
      else if (e instanceof ApiError) failed += 1; // rejected by the server (e.g. invalid): drop so it cannot block the queue
      else keep.push(item);
    }
  }
  await setJSON(QUEUE_KEY, keep);
  return { sent, failed, remaining: keep.length };
}

/** Drops everything waiting to be sent (used when signing out, so data never goes out under another account). */
export async function clearQueue(): Promise<void> {
  await setJSON(QUEUE_KEY, []);
}
