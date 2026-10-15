import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuestTelemetry } from '../../src/platform/guest-telemetry';
import { createAnalytics } from '../../src/platform/analytics';
import { createGuestEvents } from '../../src/platform/guestEvents';
import { createClientReporter } from '../../src/platform/clientEvents';
import { createOrderStorage } from '../../src/storage/storage';
import { createGuestSignals } from '../../src/platform/guest-signals';
import type { NotificationState } from '../../src/platform/notifications';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.head.replaceChildren();
});
const success = async (body: unknown) => {
  void body;
  return { ok: true as const, data: { ok: true } };
};
function harness() {
  let visible = true,
    now = 0;
  const tag = vi.fn<(...args: unknown[]) => void>(),
    sendStep = vi.fn(success),
    sendReport = vi.fn(success),
    storage = createOrderStorage();
  storage.writeOrder({
    n: 112,
    d: '2026-10-07',
    claim: 'private-claim',
    fb: { id: 1, token: 'private-edit', rating: 5, branch: 'positive' },
  });
  const analytics = createAnalytics(
    () => ({
      pathname: () => '/board',
      origin: 'https://example.test',
      document,
      getTag: () => tag,
      setTag: vi.fn(),
    }),
    { loadScript: false },
  );
  const telemetry = createGuestTelemetry({
    analytics,
    step: createGuestEvents(storage, sendStep),
    reporter: createClientReporter(sendReport, () => now),
    visible: () => visible,
  });
  return {
    telemetry,
    tag,
    sendStep,
    sendReport,
    storage,
    visible: (value: boolean) => {
      visible = value;
    },
    now: (value: number) => {
      now = value;
    },
  };
}
describe('guest event wiring and privacy', () => {
  it('uses generated render details and preserves the shared claim/report cooldown', () => {
    const h = harness();
    h.telemetry.screen('order');
    const release = h.telemetry.beginClaim();
    h.telemetry.renderFailed();
    expect(h.sendReport).not.toHaveBeenCalled();
    release();
    h.telemetry.renderFailed();
    h.telemetry.renderFailed();
    expect(h.sendReport).toHaveBeenCalledExactlyOnceWith({
      kind: 'render',
      screen: 'order',
      detail: 'Ошибка отображения экрана',
    });
    expect(JSON.stringify(h.sendReport.mock.calls)).not.toMatch(
      /private-claim|private-edit|comment|contact/,
    );
  });
  it('records rating steps and goals without drafts/tokens and protects the shared bucket during claimEnsure', () => {
    const h = harness();
    const release = h.telemetry.beginClaim();
    h.telemetry.recovered(65000);
    expect(h.sendReport).not.toHaveBeenCalled();
    release();
    h.telemetry.ratingShown();
    h.telemetry.ratingShown();
    h.telemetry.rated();
    h.telemetry.detailed();
    h.telemetry.reviewClick();
    expect(
      h.sendStep.mock.calls.map(([body]) => (body as { step: string }).step),
    ).toEqual(['rate_shown', 'rated', 'review_click']);
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'rate');
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'feedback_sent');
    expect(JSON.stringify(h.sendStep.mock.calls)).not.toMatch(
      /private-claim|private-edit|comment|contact/,
    );
    expect(JSON.stringify(h.tag.mock.calls)).not.toMatch(
      /private-claim|private-edit|\b112\b/,
    );
  });
  it('does not duplicate initialization, board_open, or consecutive pageviews on remount', () => {
    const h = harness(),
      off = h.telemetry.mount();
    off();
    const off2 = h.telemetry.mount();
    h.telemetry.screen('entry');
    h.telemetry.screen('entry');
    h.telemetry.screen('order');
    h.telemetry.screen('queue');
    h.telemetry.screen('help');
    expect(h.tag.mock.calls.filter((call) => call[1] === 'init')).toHaveLength(
      1,
    );
    expect(h.tag.mock.calls.filter((call) => call[1] === 'hit')).toHaveLength(
      4,
    );
    expect(h.sendStep).toHaveBeenCalledOnce();
    expect(h.sendStep.mock.calls[0]?.[0]).toMatchObject({
      step: 'board_open',
      number: 112,
    });
    expect(document.querySelector('script')).toBeNull();
    off2();
  });
  it('records each attempt/failure but deduplicates successful visit steps', () => {
    const h = harness();
    const a = h.telemetry.beginSubscription();
    h.telemetry.subscriptionFailed();
    a();
    const b = h.telemetry.beginSubscription();
    h.telemetry.subscriptionFailed();
    b();
    const c = h.telemetry.beginSubscription();
    h.telemetry.subscribed({ pending: true, alreadyServed: false });
    c();
    h.telemetry.subscribed({ pending: false, alreadyServed: true });
    const bodies = h.sendStep.mock.calls.map(
      ([body]) => body as { step: string },
    );
    expect(bodies.filter((body) => body.step === 'sub_try')).toHaveLength(3);
    expect(bodies.filter((body) => body.step === 'sub_fail')).toHaveLength(2);
    expect(bodies.filter((body) => body.step === 'sub_ok')).toHaveLength(1);
    expect(bodies.filter((body) => body.step === 'sub_pending')).toHaveLength(
      1,
    );
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'sub_served');
    for (const call of h.tag.mock.calls.filter(
      (call) => call[1] === 'reachGoal',
    ))
      expect(call).toHaveLength(3);
    expect(JSON.stringify(h.tag.mock.calls)).not.toMatch(
      /private-claim|private-edit|\b112\b/,
    );
    expect(JSON.stringify(h.sendStep.mock.calls)).not.toMatch(
      /private-claim|private-edit|contact|comment/,
    );
  });
  it('counts a ready goal once per dispatched transition and ready_seen only when visible', () => {
    const h = harness();
    h.visible(false);
    h.telemetry.ready();
    h.telemetry.observeReady(true);
    h.telemetry.observeReady(false);
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'order_ready');
    expect(h.sendStep).not.toHaveBeenCalled();
    h.visible(true);
    h.telemetry.observeReady(true);
    h.telemetry.observeReady(true);
    h.telemetry.ready();
    expect(h.sendStep).toHaveBeenCalledOnce();
    expect(h.sendStep.mock.calls[0]?.[0]).toMatchObject({ step: 'ready_seen' });
  });
  it('never uses the shared client-event/claim rate bucket during subscription', () => {
    const h = harness();
    h.telemetry.screen('order');
    const release = h.telemetry.beginSubscription();
    h.telemetry.recovered(65000);
    expect(h.sendReport).not.toHaveBeenCalled();
    release();
    h.telemetry.recovered(65000);
    h.telemetry.recovered(65000);
    expect(h.sendReport).toHaveBeenCalledExactlyOnceWith({
      kind: 'offline',
      screen: 'order',
      detail: 'Экран был без связи 65 с',
    });
    h.now(60000);
    h.telemetry.screen('help');
    h.telemetry.recovered(35000);
    expect(h.sendReport).toHaveBeenCalledTimes(2);
  });
  it('ignores unsupported/default permission responses', () => {
    const h = harness();
    h.telemetry.permission('default');
    h.telemetry.permission('unsupported');
    expect(h.tag).not.toHaveBeenCalled();
    h.telemetry.permission('granted');
    h.telemetry.permission('denied');
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'notif_granted');
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'notif_denied');
  });
  it('starts a new deduplication scope when the actual visit identity changes', () => {
    const h = harness();
    const off = h.telemetry.mount();
    off();
    sessionStorage.clear();
    const off2 = h.telemetry.mount();
    expect(h.sendStep).toHaveBeenCalledTimes(2);
    off2();
  });
  it('does not break the guest flow when an analytics/step implementation throws', () => {
    const fail = () => {
      throw new Error('blocked');
    };
    const telemetry = createGuestTelemetry({
      analytics: { initialize: fail, hit: fail, goal: fail },
      step: fail,
    });
    const off = telemetry.mount();
    expect(() => telemetry.screen('entry')).not.toThrow();
    expect(() => telemetry.ready()).not.toThrow();
    off();
  });
});
describe('permission goals describe actual decisions, not pre-existing grants', () => {
  it.each(['default', 'granted', 'denied', 'unsupported'] as const)(
    'handles prior permission %s',
    async (previous) => {
      const h = harness();
      const signals = createGuestSignals({
        notifications: {
          state: () => previous,
          initialize: async () => {},
          requestFromSubscribeGesture: async () =>
            previous === 'default' ? 'granted' : previous,
          showReady: async () => {},
          showRatingPrompt: async () => {},
        },
      });
      await signals.requestPermissionFromGesture(h.telemetry.permission);
      expect(
        h.tag.mock.calls.filter((call) => call[2] === 'notif_granted'),
      ).toHaveLength(previous === 'default' ? 1 : 0);
    },
  );
  it.each(['denied', 'default', 'unsupported'] as NotificationState[])(
    'records only an actual denied decision (%s)',
    async (answer) => {
      const h = harness();
      const signals = createGuestSignals({
        notifications: {
          state: () => 'default',
          initialize: async () => {},
          requestFromSubscribeGesture: async () => answer,
          showReady: async () => {},
          showRatingPrompt: async () => {},
        },
      });
      await signals.requestPermissionFromGesture(h.telemetry.permission);
      expect(
        h.tag.mock.calls.filter((call) => call[2] === 'notif_denied'),
      ).toHaveLength(answer === 'denied' ? 1 : 0);
    },
  );
});
