/**
 * Offline-first measurement capture for Kaders working where there is no signal.
 * Measurements are queued on the device with a client UUID and uploaded to /api/sync later;
 * the server de-duplicates by UUID so retries are safe.
 */
import { api, NetworkError } from './api';
import { getJSON, setJSON } from './storage';

const QUEUE_KEY = 'nutrisense.offlineQueue';

export interface QueuedMeasurement {
  child_id: number;
  child_name: string;
  weight_kg: number;
  height_cm: number;
  muac_cm?: number | null;
  position: 'lying' | 'standing';
  measured_at: string;
  client_uuid: string;
}

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function queued(): Promise<QueuedMeasurement[]> {
  return getJSON<QueuedMeasurement[]>(QUEUE_KEY, []);
}

export async function enqueue(m: QueuedMeasurement): Promise<number> {
  const q = await queued();
  q.push(m);
  await setJSON(QUEUE_KEY, q);
  return q.length;
}

export async function flush(): Promise<{ sent: number; failed: number; remaining: number }> {
  const q = await queued();
  if (!q.length) return { sent: 0, failed: 0, remaining: 0 };
  try {
    const res = await api<{ results: { client_uuid: string; status: string }[] }>('/api/sync', {
      body: { measurements: q.map(({ child_name, ...rest }) => rest) },
    });
    const done = new Set(res.results.filter((r) => r.status !== 'error').map((r) => r.client_uuid));
    const failed = res.results.filter((r) => r.status === 'error').length;
    // Items the server rejected (e.g. implausible values) are dropped so they do not block the queue.
    await setJSON(QUEUE_KEY, []);
    return { sent: done.size, failed, remaining: 0 };
  } catch (e) {
    if (e instanceof NetworkError) return { sent: 0, failed: 0, remaining: q.length };
    throw e;
  }
}
