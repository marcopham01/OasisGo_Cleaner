type BadgeListener = (count: number) => void;

let currentCount = 0;
const listeners = new Set<BadgeListener>();

function notify() {
  listeners.forEach((listener) => {
    listener(currentCount);
  });
}

export function getNotificationBadgeCount() {
  return currentCount;
}

export function subscribeNotificationBadge(listener: BadgeListener) {
  listeners.add(listener);
  listener(currentCount);

  return () => {
    listeners.delete(listener);
  };
}

export function setNotificationBadgeCount(nextCount: number) {
  currentCount = Math.max(0, Number(nextCount) || 0);
  notify();
}

export function incrementNotificationBadge(delta = 1) {
  currentCount = Math.max(0, currentCount + Math.max(0, Number(delta) || 0));
  notify();
}

export function decrementNotificationBadge(delta = 1) {
  currentCount = Math.max(0, currentCount - Math.max(0, Number(delta) || 0));
  notify();
}
