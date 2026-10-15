import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotifications } from '../../src/platform/notifications';
import { createSound } from '../../src/platform/sound';
import { vibrate, vibrationPatterns } from '../../src/platform/vibration';
import {
  createClientReporter,
  installErrorReporting,
} from '../../src/platform/clientEvents';
import { createGuestEvents } from '../../src/platform/guestEvents';
import { createAnalytics, goalNames } from '../../src/platform/analytics';
import { createOrderStorage } from '../../src/storage/storage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.head.replaceChildren();
});
const ok = async (body: unknown) => {
  void body;
  return { ok: true as const, data: { ok: true } };
};
function notificationRuntime(permission: NotificationPermission = 'granted') {
  const constructor = vi.fn(),
    requestPermission = vi.fn(async () => {
      Fake.permission = 'granted';
      return 'granted' as NotificationPermission;
    });
  class Fake {
    static permission = permission;
    static requestPermission = requestPermission;
    constructor(...args: unknown[]) {
      constructor(...args);
    }
  }
  const registration = {
    showNotification: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceWorkerRegistration;
  const worker = {
    register: vi.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
  };
  return {
    api: Fake as unknown as typeof Notification,
    worker,
    registration,
    constructor,
    requestPermission,
  };
}
describe('progressive notifications', () => {
  it('registers the unchanged notification worker once, without asking on initialize', async () => {
    const env = notificationRuntime(),
      notifications = createNotifications(() => env);
    await notifications.initialize();
    await notifications.initialize();
    expect(env.worker.register).toHaveBeenCalledExactlyOnceWith('/sw.js');
    expect(env.requestPermission).not.toHaveBeenCalled();
    expect(await notifications.requestFromSubscribeGesture()).toBe('granted');
    await notifications.showReady(112);
    await notifications.showRatingPrompt(112);
    expect(env.registration.showNotification).toHaveBeenCalledWith(
      'Заказ №112 готов',
      expect.objectContaining({
        body: 'Забирайте на выдаче',
        tag: 'iskendy-order',
        renotify: true,
      }),
    );
    expect(env.registration.showNotification).toHaveBeenCalledWith(
      'Как вам заказ 112?',
      expect.objectContaining({ body: 'Оцените — это пять секунд' }),
    );
  });
  it('asks only on the explicit subscribe action', async () => {
    const env = notificationRuntime('default'),
      notifications = createNotifications(() => env);
    await notifications.initialize();
    await notifications.showReady(112);
    expect(env.requestPermission).not.toHaveBeenCalled();
    expect(env.worker.register).not.toHaveBeenCalled();
    expect(await notifications.requestFromSubscribeGesture()).toBe('granted');
    expect(env.requestPermission).toHaveBeenCalledOnce();
  });
  it.each(['unsupported', 'denied'] as const)(
    'degrades without requests when %s',
    async (state) => {
      const env = notificationRuntime('denied'),
        notifications = createNotifications(() =>
          state === 'unsupported' ? {} : env,
        );
      expect(notifications.state()).toBe(state);
      expect(await notifications.requestFromSubscribeGesture()).toBe(state);
      await notifications.showReady(112);
      expect(env.worker.register).not.toHaveBeenCalled();
    },
  );
  it('does not break the flow if permission prompting throws', async () => {
    const env = notificationRuntime('default');
    env.requestPermission.mockRejectedValue(new Error('denied API'));
    expect(
      await createNotifications(() => env).requestFromSubscribeGesture(),
    ).toBe('default');
  });
  it.each(['register', 'show'])(
    'falls back when service-worker %s fails',
    async (stage) => {
      const env = notificationRuntime();
      if (stage === 'register')
        env.worker.register.mockRejectedValue(new Error('blocked'));
      else
        vi.mocked(env.registration.showNotification).mockRejectedValue(
          new Error('blocked'),
        );
      await createNotifications(() => env).showReady(112);
      expect(env.constructor).toHaveBeenCalledOnce();
    },
  );
  it('bounds a worker that never becomes ready', async () => {
    vi.useFakeTimers();
    const env = notificationRuntime();
    env.worker.ready = new Promise(() => {});
    const operation = createNotifications(() => env).showReady(112);
    await vi.advanceTimersByTimeAsync(5000);
    await operation;
    expect(env.constructor).toHaveBeenCalledOnce();
  });
  it('supports the default runtime when APIs are absent', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(createNotifications().state()).toBe('unsupported');
  });
});

describe('sound and vibration', () => {
  it('makes the two legacy tones and releases nodes after playback', async () => {
    const oscillators: {
      frequency: { value: number };
      onended: (() => void) | null;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      type: string;
    }[] = [];
    const context = {
      state: 'suspended',
      currentTime: 1,
      destination: {},
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
      createOscillator: vi.fn(() => {
        const node = {
          frequency: { value: 0 },
          onended: null as (() => void) | null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          type: '',
        };
        oscillators.push(node);
        return node;
      }),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      })),
    };
    const factory = vi.fn(() => context as unknown as AudioContext),
      sound = createSound(factory);
    const stop = sound.installGestureUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    await sound.chime();
    stop();
    expect(factory).toHaveBeenCalledOnce();
    expect(oscillators.map((node) => node.frequency.value)).toEqual([
      880, 1174.7,
    ]);
    oscillators.forEach((node) => {
      node.onended?.();
      expect(node.disconnect).toHaveBeenCalledOnce();
    });
  });
  it('tolerates absent and blocked audio APIs', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await createSound().chime();
    await createSound(() => {
      throw new Error('blocked');
    }).chime();
    await createSound(
      () =>
        ({
          state: 'running',
          createOscillator: () => {
            throw new Error('blocked');
          },
        }) as unknown as AudioContext,
    ).chime();
  });
  it('uses the supported browser AudioContext constructor', async () => {
    const constructor = vi.fn(function () {
      return { state: 'running' };
    });
    vi.stubGlobal('AudioContext', constructor);
    await createSound().unlockFromGesture();
    expect(constructor).toHaveBeenCalledOnce();
  });
  it('uses vibration when supported and silently tolerates a missing/blocked motor', () => {
    const fn = vi.fn();
    vibrate([...vibrationPatterns.ready], { vibrate: fn });
    expect(fn).toHaveBeenCalledWith([90, 70, 90, 70, 160]);
    vibrate(30, {} as Navigator);
    vibrate(30, {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    vibrate(30);
  });
});

describe('bounded, non-sensitive screen reporting', () => {
  it('throttles at 60 seconds and suppresses the entire active subscription interval', async () => {
    let now = 0;
    const send = vi.fn(ok),
      reporter = createClientReporter(send, () => now);
    expect(
      reporter.report({ kind: 'offline', screen: 'order', durationMs: 123456 }),
    ).toBe(true);
    expect(send).toHaveBeenCalledWith({
      kind: 'offline',
      screen: 'order',
      detail: 'Экран был без связи 123 с',
    });
    now = 59999;
    expect(reporter.report({ kind: 'js', screen: 'entry' })).toBe(false);
    now = 60000;
    const endA = reporter.beginSubscription(),
      endB = reporter.beginSubscription();
    endA();
    endA();
    expect(reporter.report({ kind: 'js', screen: 'entry' })).toBe(false);
    endB();
    expect(reporter.report({ kind: 'render', screen: 'entry' })).toBe(true);
    now = 120000;
    expect(
      reporter.report({
        kind: 'offline',
        screen: 'entry',
        durationMs: Infinity,
      }),
    ).toBe(true);
    expect(JSON.stringify(send.mock.calls)).not.toMatch(
      /claimToken|editToken|contact|comment/,
    );
    await Promise.resolve();
  });
  it('reports generic JS failure and cleans up both listeners', () => {
    const send = vi.fn(ok),
      reporter = createClientReporter(send),
      remove = vi.spyOn(window, 'removeEventListener');
    const stop = installErrorReporting(reporter, () => 'order');
    window.dispatchEvent(new Event('unhandledrejection'));
    stop();
    expect(send).toHaveBeenCalledWith({
      kind: 'js',
      screen: 'order',
      detail: 'Ошибка выполнения скрипта',
    });
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('silently handles a sender rejection and supports the default typed sender', async () => {
    createClientReporter(
      vi.fn().mockRejectedValue(new Error('offline')),
    ).report({ kind: 'js', screen: 'entry' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    expect(createClientReporter().report({ kind: 'js', screen: 'entry' })).toBe(
      true,
    );
    await Promise.resolve();
  });
});

describe('guest funnel continuity', () => {
  it('deduplicates steps except attempts/failures and sends only the own order number', async () => {
    const storage = createOrderStorage(),
      send = vi.fn(ok),
      step = createGuestEvents(storage, send);
    step('board_open');
    step('board_open');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      number: null,
      step: 'board_open',
    });
    storage.writeOrder({ n: 112, d: '2026-10-07', claim: 'must-not-leak' });
    step('sub_try');
    step('sub_try');
    step('sub_fail');
    step('sub_fail');
    step('sub_ok');
    step('sub_ok');
    expect(send).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(send.mock.calls)).not.toContain('must-not-leak');
    await Promise.resolve();
  });
  it('supports default transport and ignores rejection without retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    createGuestEvents()('board_open');
    createGuestEvents(
      createOrderStorage(),
      vi.fn().mockRejectedValue(new Error('offline')),
    )('board_open');
    await Promise.resolve();
  });
});

describe('analytics boundaries', () => {
  it.each(['/tv', '/staff', '/stats', '/unknown'])(
    'does not initialize or report on %s',
    (pathname) => {
      const tag = vi.fn(),
        analytics = createAnalytics(() => ({
          pathname: () => pathname,
          origin: 'https://example.test',
          document,
          getTag: () => tag,
          setTag: vi.fn(),
        }));
      analytics.initialize();
      analytics.hit('entry');
      analytics.goal('sub_ok');
      expect(tag).not.toHaveBeenCalled();
      expect(document.querySelector('script')).toBeNull();
    },
  );
  it('initializes once and sends one pageview per screen with no arbitrary params', () => {
    const tag = vi.fn(),
      analytics = createAnalytics(() => ({
        pathname: () => '/board',
        origin: 'https://example.test',
        document,
        getTag: () => tag,
        setTag: vi.fn(),
      }));
    analytics.initialize();
    analytics.initialize();
    analytics.hit('order');
    analytics.hit('order');
    analytics.hit('queue');
    analytics.hit('help');
    for (const goal of goalNames) analytics.goal(goal);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(tag.mock.calls.filter((call) => call[1] === 'init')).toHaveLength(1);
    expect(tag.mock.calls.filter((call) => call[1] === 'hit')).toHaveLength(3);
    expect(
      tag.mock.calls
        .filter((call) => call[1] === 'reachGoal')
        .every((call) => call.length === 3),
    ).toBe(true);
  });
  it('queues safely if the script has not loaded yet and handles blockers', () => {
    let tag: Window['ym'];
    const env = {
      pathname: () => '/',
      origin: 'https://example.test',
      document,
      getTag: () => tag,
      setTag: (value: NonNullable<Window['ym']>) => {
        tag = value;
      },
    };
    const analytics = createAnalytics(() => env);
    analytics.initialize();
    analytics.hit('entry');
    expect(tag?.a).toHaveLength(2);
    tag = () => {
      throw new Error('blocked');
    };
    expect(() => analytics.goal('sub_ok')).not.toThrow();
    const second = createAnalytics(() => env);
    second.initialize();
    expect(document.querySelectorAll('script')).toHaveLength(1);
  });
  it('supports the normal browser runtime without initializing on import', () => {
    window.ym = vi.fn<(...args: unknown[]) => void>();
    const analytics = createAnalytics();
    analytics.initialize();
    analytics.hit('entry');
    expect(window.ym).toHaveBeenCalled();
    delete window.ym;
  });
});
