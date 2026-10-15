import { useSyncExternalStore } from 'react';
// Existing guest breakpoint, docs/02 §13; M5 74:185 and D5 81:580.
const query = '(min-width: 768px)';
const snapshot = () => window.matchMedia(query).matches;
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
};
export const useDesktopViewport = () =>
  useSyncExternalStore(subscribe, snapshot, () => false);
