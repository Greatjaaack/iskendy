import { createNotifications, type NotificationState } from './notifications';
import { createSound } from './sound';
import { vibrate, vibrationPatterns } from './vibration';

type Dependencies = {
  sound?: ReturnType<typeof createSound>;
  notifications?: ReturnType<typeof createNotifications>;
  vibration?: typeof vibrate;
};
const safely = (effect: () => unknown): void => {
  try {
    void Promise.resolve(effect()).catch(() => {});
  } catch {
    /* One unavailable channel must not prevent another. */
  }
};
/** Side-effect-free construction; browser capabilities are touched only on explicit methods. */
export function createGuestSignals({
  sound = createSound(),
  notifications = createNotifications(),
  vibration = vibrate,
}: Dependencies = {}) {
  return {
    initialize: () => notifications.initialize(),
    // «Уведомления» sheet text depends on the current browser permission (UX-14).
    permission: () => notifications.state(),
    installGestureUnlock: () => sound.installGestureUnlock(),
    unlockFromGesture: () => sound.unlockFromGesture(),
    async requestPermissionFromGesture(
      onDecision?: (state: NotificationState) => void,
    ) {
      const previous = notifications.state();
      const state = await notifications.requestFromSubscribeGesture();
      if (previous === 'default' && (state === 'granted' || state === 'denied'))
        safely(() => onDecision?.(state));
      return state;
    },
    subscribed(): void {
      safely(() => vibration(vibrationPatterns.subscribed));
    },
    rating(number: number): void {
      safely(() => vibration([...vibrationPatterns.rating]));
      safely(() => sound.chime());
      safely(() => notifications.showRatingPrompt(number));
    },
    ready(number: number): void {
      safely(() => vibration([...vibrationPatterns.ready]));
      safely(() => sound.chime());
      safely(() => notifications.showReady(number));
    },
  };
}
export type GuestSignals = ReturnType<typeof createGuestSignals>;
export const guestSignals = createGuestSignals();
