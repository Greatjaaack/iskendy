import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConnectivity } from '../../src/polling/connectivity';
import { nextInterval } from '../../src/polling/interval';
import { createGuestEvents } from '../../src/platform/guestEvents';
import { createClientReporter } from '../../src/platform/clientEvents';
import { createOrderStorage } from '../../src/storage/storage';

const html = readFileSync(resolve(process.cwd(), 'legacy/index.html'), 'utf8');
const script = html.slice(
  html.indexOf('    const API = "";'),
  html.lastIndexOf('</script>'),
);
const parsed = ts.createSourceFile(
  'legacy.js',
  script,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const names = [
  'guestId',
  'guestSession',
  'guestStep',
  'fbMy',
  'reportClient',
  'markPollOk',
  'markPollFail',
  'loadStatus',
  'pollDelay',
  'startPolling',
  'stopPolling',
];
const functions = parsed.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text),
);
const visibility = parsed.statements.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(parsed) ===
      'document.addEventListener' &&
    node.expression.arguments[0]?.getText(parsed) === '"visibilitychange"',
);
if (functions.length !== names.length || !visibility)
  throw new Error('Legacy runtime changed; review harness.');
const legacyCode = functions.map((node) => node.getText(parsed)).join('\n');
const baseTime = 1791360000000;
const order = {
  n: 112,
  d: '2026-10-07',
  claim: 'synthetic-claim',
  fb: { id: 1, token: 'synthetic-edit', rating: 5, branch: 'positive' },
};
const entries = [
  ['iskendy_guest', 'synthetic-guest'],
  ['iskendi_my_order', JSON.stringify(order)],
];
const memory = (values) => {
  const map = new Map(values);
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
};
const success = new globalThis.Response('{"ok":true}', {
  headers: { 'Content-Type': 'application/json' },
});

/** Execute only exact legacy runtime declarations and its exact visibility listener.
 * Synthetic fetch and render sinks; no legacy startup/router/UI/network execution. */
function legacy({ holdStatus = false, failEvents = false } = {}) {
  const calls = [],
    pending = [],
    listeners = new Map();
  let active = 0,
    maxActive = 0;
  const context = createContext({
    API: '',
    FB_KEY: 'iskendi_my_order',
    guestSent: new Set(),
    lastReportAt: 0,
    pollTimer: null,
    POLL_ACTIVE_MS: 5000,
    POLL_HIDDEN_MS: 20000,
    OFFLINE_AFTER_FAILS: 2,
    pollFails: 0,
    lastOkAt: null,
    offlineSince: null,
    state: null,
    Date,
    localStorage: memory(entries),
    sessionStorage: memory([['iskendy_visit', 'synthetic-visit']]),
    location: { pathname: '/board' },
    document: {
      visibilityState: 'visible',
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    setInterval: (...args) => globalThis.setInterval(...args),
    clearInterval: (id) => globalThis.clearInterval(id),
    hideOfflineBar() {},
    showOfflineBar() {},
    renderGuest() {},
    renderStaff() {},
    fetch: (path, options = {}) => {
      calls.push({
        path,
        method: options.method ?? 'GET',
        at: Date.now(),
        ...(options.body ? { body: JSON.parse(options.body) } : {}),
        ...(options.keepalive ? { keepalive: true } : {}),
      });
      if (path === '/api/status') {
        active++;
        maxActive = Math.max(maxActive, active);
        const response = {
          ok: true,
          json: async () => ({ date: '2026-10-07', orders: [] }),
        };
        if (holdStatus)
          return new Promise((resolve) =>
            pending.push(() => {
              active--;
              resolve(response);
            }),
          );
        active--;
        return Promise.resolve(response);
      }
      return failEvents
        ? Promise.reject(new Error('synthetic blocked telemetry'))
        : Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    },
  });
  runInContext(
    `${legacyCode}\n${visibility.getText(parsed)}\nthis.api={${names.join(',')}};`,
    context,
    { timeout: 1000 },
  );
  return {
    context,
    calls,
    api: context.api,
    maxActive: () => maxActive,
    finish: () => pending.splice(0).forEach((resolve) => resolve()),
    visibility: (value) => {
      context.document.visibilityState = value;
      listeners.get('visibilitychange')();
    },
  };
}
function currentEvents(fail = false) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path, options) => {
      calls.push({
        path: String(path),
        method: options.method,
        body: JSON.parse(options.body),
        keepalive: options.keepalive,
      });
      if (fail) throw new Error('synthetic blocked telemetry');
      return success.clone();
    }),
  );
  const local = memory(entries),
    session = memory([['iskendy_visit', 'synthetic-visit']]);
  const storage = createOrderStorage({
    local: () => local,
    session: () => session,
  });
  return { calls, storage, session, step: createGuestEvents(storage) };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('W5-1 legacy runtime comparison', () => {
  it('matches active and hidden base intervals; backoff is the accepted ADR-004 difference', () => {
    const old = legacy();
    expect(old.api.pollDelay()).toBe(
      nextInterval({ visible: true, failures: 0, audience: 'guest' }),
    );
    old.context.document.visibilityState = 'hidden';
    expect(old.api.pollDelay()).toBe(
      nextInterval({ visible: false, failures: 5, audience: 'guest' }),
    );
    old.context.document.visibilityState = 'visible';
    old.context.pollFails = 5;
    expect(old.api.pollDelay()).toBe(5000);
    expect(
      nextInterval({ visible: true, failures: 5, audience: 'guest' }),
    ).toBe(60000);
  });
  it('legacy starts once, uses 5/20 seconds and refreshes immediately on becoming visible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const old = legacy();
    old.api.startPolling();
    old.api.startPolling();
    await vi.advanceTimersByTimeAsync(4999);
    expect(old.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(old.calls).toHaveLength(2);
    old.visibility('hidden');
    await vi.advanceTimersByTimeAsync(19999);
    expect(old.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(old.calls).toHaveLength(3);
    old.visibility('visible');
    expect(old.calls).toHaveLength(4);
    expect(old.calls.map((call) => call.at - baseTime)).toEqual([
      0, 5000, 25000, 25000,
    ]);
    old.api.stopPolling();
    await vi.advanceTimersByTimeAsync(60000);
    expect(old.calls).toHaveLength(4);
  });
  it('documents legacy overlapping slow polls instead of restoring that defect', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const old = legacy({ holdStatus: true });
    old.api.startPolling();
    await vi.advanceTimersByTimeAsync(15000);
    expect(
      old.calls.filter((call) => call.path === '/api/status'),
    ).toHaveLength(4);
    expect(old.maxActive()).toBe(4);
    old.api.stopPolling();
    old.finish();
    await vi.advanceTimersByTimeAsync(0);
  });
  it('matches exact guest event payloads, keepalive and per-visit frequency including repeatable failures', async () => {
    const old = legacy(),
      next = currentEvents();
    const sequence = [
      'board_open',
      'board_open',
      'sub_try',
      'sub_fail',
      'sub_try',
      'sub_fail',
      'sub_try',
      'sub_ok',
      'sub_ok',
      'sub_pending',
      'sub_pending',
      'ready_seen',
      'ready_seen',
      'rate_shown',
      'rate_shown',
      'rated',
      'rated',
      'review_click',
      'review_click',
    ];
    for (const name of sequence) {
      old.api.guestStep(name, name === 'sub_try' || name === 'sub_fail');
      next.step(name);
    }
    await Promise.resolve();
    expect(next.calls).toEqual(
      old.calls.map(({ at, ...call }) => {
        void at;
        return call;
      }),
    );
    expect(next.calls.map((call) => call.body.step)).toEqual([
      'board_open',
      'sub_try',
      'sub_fail',
      'sub_try',
      'sub_fail',
      'sub_try',
      'sub_ok',
      'sub_pending',
      'ready_seen',
      'rate_shown',
      'rated',
      'review_click',
    ]);
    expect(JSON.stringify(next.calls)).not.toMatch(
      /synthetic-claim|synthetic-edit|claimToken|editToken/,
    );
  });
  it('keeps number null before subscription and never sends order tokens', () => {
    const old = legacy(),
      next = currentEvents();
    old.context.localStorage.removeItem('iskendi_my_order');
    next.storage.forgetOrder();
    old.api.guestStep('board_open');
    next.step('board_open');
    expect(next.calls[0].body).toEqual(old.calls[0].body);
    expect(next.calls[0].body.number).toBeNull();
  });
  it('does not retry blocked telemetry and still deduplicates the attempted visit step', async () => {
    const old = legacy({ failEvents: true }),
      next = currentEvents(true);
    old.api.guestStep('board_open');
    old.api.guestStep('board_open');
    next.step('board_open');
    next.step('board_open');
    await Promise.resolve();
    await Promise.resolve();
    expect(next.calls).toHaveLength(1);
    expect(old.calls).toHaveLength(1);
  });
  it('keeps guest and visit identities on reload but starts a fresh in-memory step scope like legacy', () => {
    const old = legacy(),
      next = currentEvents();
    old.api.guestStep('board_open');
    next.step('board_open');
    const reloaded = legacy(),
      again = createGuestEvents(next.storage);
    reloaded.api.guestStep('board_open');
    again('board_open');
    expect(next.calls.map((call) => call.body)).toEqual([
      old.calls[0].body,
      reloaded.calls[0].body,
    ]);
  });
  it('records the accepted 60s client throttle versus legacy 30s and suppresses subscription reports', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const old = legacy();
    const send = vi.fn(async () => ({ ok: true, data: { ok: true } }));
    let time = 0;
    const reporter = createClientReporter(send, () => time);
    old.api.reportClient('js', 'synthetic detail');
    reporter.report({ kind: 'js', screen: 'order' });
    vi.setSystemTime(baseTime + 30000);
    time = 30000;
    old.api.reportClient('js', 'synthetic detail');
    expect(reporter.report({ kind: 'js', screen: 'order' })).toBe(false);
    expect(old.calls).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(1);
    time = 60000;
    const release = reporter.beginSubscription();
    expect(reporter.report({ kind: 'js', screen: 'order' })).toBe(false);
    release();
    expect(reporter.report({ kind: 'js', screen: 'order' })).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual({
      kind: 'js',
      screen: 'order',
      detail: 'Ошибка выполнения скрипта',
    });
  });
  it.each([3600000, -3600000])(
    'keeps the accepted client-event 60s interval after wall-clock correction %s',
    async (offset) => {
      vi.useFakeTimers({
        toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'],
      });
      vi.setSystemTime(baseTime);
      const send = vi.fn(async () => ({ ok: true, data: { ok: true } })),
        reporter = createClientReporter(send);
      expect(reporter.report({ kind: 'js', screen: 'entry' })).toBe(true);
      vi.setSystemTime(baseTime + offset);
      expect(reporter.report({ kind: 'js', screen: 'entry' })).toBe(false);
      await vi.advanceTimersByTimeAsync(59999);
      expect(reporter.report({ kind: 'js', screen: 'entry' })).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(reporter.report({ kind: 'js', screen: 'entry' })).toBe(true);
      expect(send).toHaveBeenCalledTimes(2);
    },
  );
  it('documents page-local reporter scope: a reload instance starts a fresh budget, like legacy', () => {
    const send = vi.fn(async () => ({ ok: true, data: { ok: true } }));
    const first = createClientReporter(send, () => 0),
      reloaded = createClientReporter(send, () => 0);
    expect(first.report({ kind: 'js', screen: 'entry' })).toBe(true);
    expect(reloaded.report({ kind: 'js', screen: 'entry' })).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    const old = legacy(),
      oldReloaded = legacy();
    old.api.reportClient('js', 'synthetic');
    oldReloaded.api.reportClient('js', 'synthetic');
    expect(old.calls).toHaveLength(1);
    expect(oldReloaded.calls).toHaveLength(1);
  });
  it('documents recovery duration: legacy counts from second failure, new connectivity from last success', () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const old = legacy(),
      store = createConnectivity();
    old.api.markPollOk();
    store.succeed(baseTime);
    vi.setSystemTime(baseTime + 5000);
    old.api.markPollFail();
    store.fail({ kind: 'network' }, baseTime + 5000);
    vi.setSystemTime(baseTime + 10000);
    old.api.markPollFail();
    store.fail({ kind: 'network' }, baseTime + 10000);
    vi.setSystemTime(baseTime + 20000);
    old.api.markPollOk();
    expect(store.succeed(baseTime + 20000)).toBe(20000);
    expect(old.calls).toHaveLength(1);
    expect(old.calls[0].body).toEqual({
      kind: 'offline',
      screen: '/board',
      detail: 'экран был без связи 10 с',
    });
  });
});
