import { useSyncExternalStore } from 'react';
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const listener of listeners) listener();
    }, 1000);
  }
  return () => {
    listeners.delete(callback);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const snapshot = () => now;
/** UI deadlines only; never performs or schedules API requests. */
export const useGuestClock = () => useSyncExternalStore(subscribe, snapshot);
