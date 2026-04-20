import type { CleanerRealtimeNotification } from '@/types/cleaner-dashboard';

type CleanerRealtimeListener = (event: CleanerRealtimeNotification) => void;

const listeners = new Set<CleanerRealtimeListener>();

export function publishCleanerRealtimeEvent(event: CleanerRealtimeNotification) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Keep fan-out resilient when one listener throws.
    }
  });
}

export function subscribeCleanerRealtimeEvent(listener: CleanerRealtimeListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
