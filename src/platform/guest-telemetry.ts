import { createAnalytics, type AnalyticsScreen } from './analytics';
import { createGuestEvents } from './guestEvents';
import { createClientReporter, installErrorReporting } from './clientEvents';
import type { GuestStep } from '../api/endpoints/guest';
import type { NotificationState } from './notifications';

type Dependencies = {
  analytics?: ReturnType<typeof createAnalytics>;
  step?: (step: GuestStep, number?: number) => void;
  reporter?: ReturnType<typeof createClientReporter>;
  visible?: () => boolean;
};
const safe = (action: () => void) => {
  try {
    action();
  } catch {
    /* Telemetry must never affect order handling. */
  }
};
export function createGuestTelemetry({
  analytics = createAnalytics(undefined, {
    loadScript: import.meta.env.MODE !== 'mock',
  }),
  step = createGuestEvents(),
  reporter = createClientReporter(),
  visible = () => document.visibilityState !== 'hidden',
}: Dependencies = {}) {
  let screen: AnalyticsScreen = 'entry';
  const goal = (name: Parameters<typeof analytics.goal>[0]) =>
    safe(() => analytics.goal(name));
  const event = (name: GuestStep, number?: number) =>
    safe(() => step(name, number));
  return {
    mount(): () => void {
      safe(() => analytics.initialize());
      event('board_open');
      return installErrorReporting(reporter, () => screen);
    },
    screen(next: AnalyticsScreen): void {
      screen = next;
      safe(() => analytics.hit(next));
    },
    beginSubscription(): () => void {
      const release = reporter.beginSubscription();
      event('sub_try');
      return release;
    },
    beginClaim(): () => void {
      return reporter.beginSubscription();
    },
    ratingShown(number?: number): void {
      event('rate_shown', number);
    },
    rated(number?: number): void {
      goal('rate');
      event('rated', number);
    },
    detailed(): void {
      goal('feedback_sent');
    },
    reviewClick(): void {
      event('review_click');
    },
    subscriptionFailed(): void {
      goal('sub_fail');
      event('sub_fail');
    },
    subscribed({
      pending,
      alreadyServed,
    }: {
      pending: boolean;
      alreadyServed: boolean;
    }): void {
      goal(alreadyServed ? 'sub_served' : 'sub_ok');
      event('sub_ok');
      if (pending) event('sub_pending');
    },
    permission(state: NotificationState): void {
      if (state === 'granted') goal('notif_granted');
      else if (state === 'denied') goal('notif_denied');
    },
    ready(number?: number): void {
      goal('order_ready');
      if (visible()) event('ready_seen', number);
    },
    observeReady(ready: boolean): void {
      if (ready && visible()) event('ready_seen');
    },
    renderFailed(): void {
      safe(() =>
        reporter.report({
          kind: 'render',
          screen,
        }),
      );
    },
    recovered(durationMs: number): void {
      safe(() => {
        reporter.report({ kind: 'offline', screen, durationMs });
      });
    },
  };
}
export type GuestTelemetry = ReturnType<typeof createGuestTelemetry>;
export const guestTelemetry = createGuestTelemetry();
