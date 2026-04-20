import type { CreateIncidentInput } from '@/types/incident';

const QUEUE_KEY = 'montana:pending-incidents';

interface PendingIncident {
  id: string;
  payload: CreateIncidentInput;
  createdAt: number;
}

/**
 * Minimal offline queue for incident submissions. Persists in localStorage
 * so that reports created in low/no-signal mountain areas can be flushed
 * once connectivity returns. This is intentionally simple; upgrade to
 * IndexedDB + background sync when going beyond the MVP.
 */
export const offlineQueue = {
  enqueue(payload: CreateIncidentInput): PendingIncident {
    const item: PendingIncident = {
      id: crypto.randomUUID(),
      payload,
      createdAt: Date.now(),
    };
    const queue = this.readAll();
    queue.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return item;
  },

  readAll(): PendingIncident[] {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    } catch {
      return [];
    }
  },

  remove(id: string) {
    const queue = this.readAll().filter((i) => i.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  clear() {
    localStorage.removeItem(QUEUE_KEY);
  },
};

/**
 * Register a listener that drains the offline queue whenever the browser
 * comes back online. `submit` should resolve with success/failure per item.
 */
export function registerOfflineQueueFlush(
  submit: (payload: CreateIncidentInput) => Promise<boolean>,
) {
  if (typeof window === 'undefined') return () => undefined;

  const handler = async () => {
    for (const item of offlineQueue.readAll()) {
      const ok = await submit(item.payload).catch(() => false);
      if (ok) offlineQueue.remove(item.id);
    }
  };

  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
