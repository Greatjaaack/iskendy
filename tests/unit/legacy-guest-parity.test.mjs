import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { URL } from 'node:url';
import { createOrderStorage } from '../../src/storage/storage';
import { describe, expect, it } from 'vitest';
import { createSubscriptionService } from '../../src/domain/order/subscribe';
import { createRatingService } from '../../src/domain/rating/service';
import { applyServedCheck, advanceOrder } from '../../src/domain/order/machine';

const root = process.cwd();
const html = readFileSync(resolve(root, 'legacy/index.html'), 'utf8');
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
  'subSubmit',
  'subTo',
  'claimEnsure',
  'fbMy',
  'fbSaveMy',
  'fbPatchMy',
  'fbForget',
  'fbWatch',
  'myWatch',
  'fbAskServed',
  'fbSendRating',
  'fbSendDetail',
];
const declarations = parsed.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text),
);
if (declarations.length !== names.length)
  throw new Error('Legacy function set changed; review parity harness.');
const legacyCode = declarations.map((node) => node.getText(parsed)).join('\n');
const fixture = (name) =>
  JSON.parse(
    readFileSync(resolve(root, `tests/fixtures/${name}.json`), 'utf8'),
  );
const copy = (value) => JSON.parse(JSON.stringify(value));
const memoryStorage = (entries = []) => {
  const values = new Map(entries);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const initialEntries = (initial) => [
  ['iskendy_guest', 'synthetic-guest'],
  ['iskendy_staff_token', 'untouched-sentinel'],
  ...(initial ? [['iskendi_my_order', JSON.stringify(initial)]] : []),
];
const now = 1791360000000;
const board = {
  date: '2026-10-07',
  orders: [{ number: 112, status: 'preparing' }],
  servedCount: 1,
};
const seed = {
  n: 997,
  d: board.date,
  seen: true,
  subAt: 10,
  claim: 'synthetic-claim',
  servedAt: now,
  rated: false,
  done: false,
  lastStatus: 'served',
  legacyUnknown: 'retain',
};
const edited = {
  ...seed,
  rated: true,
  fb: {
    id: 1,
    token: '<token>',
    rating: 1,
    branch: 'negative',
    detailSent: false,
    legacyNested: 'retain',
  },
};

/** Exact legacy function declarations; UI/signal sinks are inert, no script startup or network.
 * This compares domain contracts, not legacy rendering or browser-level parity. */
function legacy(initial = null, responses = {}, currentBoard = board) {
  const storage = memoryStorage(initialEntries(initial));
  const session = memoryStorage([['iskendy_visit', 'synthetic-visit']]);
  const calls = [];
  const elements = new Map();
  const signals = [];
  const context = createContext({
    API: '',
    state: copy(currentBoard),
    FB_KEY: 'iskendi_my_order',
    fbLastCheck: 0,
    fbState: {
      busy: false,
      feedbackId: initial?.fb?.id,
      editToken: initial?.fb?.token,
      tags: [],
    },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    localStorage: storage,
    sessionStorage: session,
    document: {
      getElementById: (id) => {
        if (!elements.has(id))
          elements.set(id, { value: '', classList: { add() {}, remove() {} } });
        return elements.get(id);
      },
    },
    todayLocal: () => board.date,
    myStatus: () => context.status ?? 'served',
    myNotifyReady: (n) => signals.push(n),
    myOpen: () => false,
    guestStep() {},
    ymGoal() {},
    unlockAudio() {},
    showMyOrder() {},
    notifAsk() {},
    buzz() {},
    showBoard() {},
    fbStep() {},
    fbMaybePrompt() {},
    fbHighlight() {},
    fbFail() {},
    fbMarkMine() {},
    fbShowThanks() {},
    fbShowSorry() {},
    myRender() {},
    fetch: async (url, options = {}) => {
      const parsedUrl = new URL(url, 'http://synthetic.invalid');
      const path = parsedUrl.pathname;
      calls.push({
        path,
        method: options.method ?? 'GET',
        ...(parsedUrl.search ? { query: parsedUrl.search } : {}),
        ...(options.body ? { body: JSON.parse(options.body) } : {}),
      });
      const response = responses[path];
      if (response === 'network') throw new Error('synthetic outage');
      if (!response)
        throw new Error(`Unconfigured synthetic endpoint: ${path}`);
      return { json: async () => copy(response) };
    },
  });
  runInContext(`${legacyCode}\nthis.api = { ${names.join(',')} };`, context, {
    timeout: 1000,
  });
  return {
    calls,
    signals,
    context,
    api: context.api,
    storage,
    session,
    read: () => JSON.parse(storage.getItem('iskendi_my_order') ?? 'null'),
    submit: async (n) => {
      context.document.getElementById('subNum').value = String(n);
      await context.api.subSubmit();
    },
  };
}
function current(initial = null, responses = {}) {
  const storage = memoryStorage(initialEntries(initial));
  const session = memoryStorage([['iskendy_visit', 'synthetic-visit']]);
  const order = createOrderStorage({
    local: () => storage,
    session: () => session,
  });
  const calls = [];
  const request = async (path, body, query) => {
    calls.push({
      path,
      method: body ? 'POST' : 'GET',
      ...(query ? { query } : {}),
      ...(body ? { body: copy(body) } : {}),
    });
    const response = responses[path];
    if (response === 'network')
      return { ok: false, error: { kind: 'network' } };
    if (response === '429')
      return { ok: false, error: { kind: 'http', status: 429 } };
    if (!response) throw new Error(`Unconfigured synthetic endpoint: ${path}`);
    return { ok: true, data: copy(response) };
  };
  const dependencies = {
    check: (n) => request('/api/feedback/check', undefined, `?number=${n}`),
    claim: (body) => request('/api/guest/claim', body),
    create: (body) => request('/api/feedback', body),
    rate: (body) => request('/api/feedback/rate', body),
    detail: (body) => request('/api/feedback/detail', body),
    read: order.readOrder,
    write: order.writeOrder,
    guest: order.guestId,
  };
  const subscribe = createSubscriptionService(dependencies);
  return {
    calls,
    rating: createRatingService(dependencies),
    storage,
    session,
    order,
    read: order.readOrder,
    submit: async (n, activeBoard = board) => {
      const result = await subscribe(
        String(n),
        activeBoard,
        order.guestId(),
        now,
      );
      if (result.ok) order.writeOrder(result.record);
      return result;
    },
  };
}

describe('W5-1 exact legacy domain request/storage parity', () => {
  const claim = fixture('claim-ok');
  for (const [label, n, check] of [
    ['visible active order', 112, null],
    ['not yet on board', 997, { ok: false, reason: 'not_found' }],
    [
      'stale board while order is active',
      997,
      { ok: false, reason: 'not_served' },
    ],
    ['already served', 997, fixture('check-served-positive')],
    ['already rated', 997, { ok: false, reason: 'already' }],
  ])
    it(`subscription matches requests and full stored record: ${label}`, async () => {
      const responses = {
        '/api/guest/claim': { ...claim, number: n },
        '/api/feedback/check': check,
      };
      const old = legacy(null, responses),
        next = current(null, responses);
      await old.submit(n);
      await next.submit(n);
      expect(next.calls).toEqual(old.calls);
      expect(next.read()).toEqual(old.read());
      expect(next.read().d).toBe(board.date);
      expect([...next.storage.values.keys()]).toEqual([
        ...old.storage.values.keys(),
      ]);
      for (const key of ['iskendy_guest', 'iskendy_staff_token'])
        expect(next.storage.getItem(key)).toBe(old.storage.getItem(key));
    });
  for (const [label, response] of [
    ['taken', fixture('claim-taken')],
    ['too many guests', fixture('claim-too-many')],
    ['claim network outage', 'network'],
  ])
    it(`subscription preserves legacy request/storage result: ${label}`, async () => {
      const responses = { '/api/guest/claim': response };
      const old = legacy(null, responses),
        next = current(null, responses);
      await old.submit(112);
      await next.submit(112);
      expect(next.calls).toEqual(old.calls);
      expect(next.read()).toEqual(old.read());
      expect(next.calls).toHaveLength(1);
    });
  it('HTTP 429 never creates an order or repeats a claim', async () => {
    const old = legacy(null, {
      '/api/guest/claim': { detail: 'synthetic rate limit' },
    });
    const next = current(null, { '/api/guest/claim': '429' });
    await old.submit(112);
    await next.submit(112);
    expect(next.calls).toEqual(old.calls);
    expect(next.read()).toBeNull();
    expect(old.read()).toBeNull();
  });
  for (const reason of ['already', 'not_found', 'not_served'])
    it(`served check preserves legacy patch: ${reason}`, async () => {
      const initial = { ...seed, servedAt: 0, lastStatus: '' };
      const response = { ok: false, reason };
      const old = legacy(initial, { '/api/feedback/check': response });
      await old.api.fbAskServed(initial);
      expect(applyServedCheck(initial, response, now)).toEqual(old.read());
      expect(old.calls).toEqual([
        { path: '/api/feedback/check', method: 'GET', query: '?number=997' },
      ]);
    });
  it('day change removes yesterday order in both flows', () => {
    const changed = { ...board, date: '2026-10-08' };
    const old = legacy(seed, {}, changed);
    old.api.fbWatch();
    const next = advanceOrder(seed, changed, now);
    expect(next.record).toBeNull();
    expect(old.read()).toBeNull();
    expect(next.effects).toEqual(['forget']);
    expect(old.calls).toEqual([]);
  });
  it('first rating adds an intentional fresh check but preserves create payload and stored feedback', async () => {
    const responses = {
      '/api/feedback/check': fixture('check-served-positive'),
      '/api/feedback': fixture('feedback-positive'),
    };
    const old = legacy(seed, responses),
      next = current(seed, responses);
    await old.api.fbSendRating(5);
    await next.rating.submit(5);
    expect(next.calls).toEqual([
      { path: '/api/feedback/check', method: 'GET', query: '?number=997' },
      ...old.calls,
    ]);
    expect(next.read()).toEqual(old.read());
  });
  it('missing claim adds fresh check, then identical claim/create with same guest and stored key', async () => {
    const initial = { ...seed, claim: '' };
    const responses = {
      '/api/feedback/check': fixture('check-served-positive'),
      '/api/guest/claim': { ...claim, number: 997 },
      '/api/feedback': fixture('feedback-positive'),
    };
    const old = legacy(initial, responses),
      next = current(initial, responses);
    await old.api.fbSendRating(5);
    await next.rating.submit(5);
    expect(next.calls).toEqual([
      { path: '/api/feedback/check', method: 'GET', query: '?number=997' },
      ...old.calls,
    ]);
    expect(next.read()).toEqual(old.read());
  });
  it('changing an existing rating uses only rate and retains legacy nested fields', async () => {
    const responses = { '/api/feedback/rate': fixture('rate-ok') };
    const old = legacy(edited, responses),
      next = current(edited, responses);
    await old.api.fbSendRating(5);
    await next.rating.submit(5);
    expect(next.calls).toEqual(old.calls);
    expect(next.read()).toMatchObject(old.read());
    expect(next.read().fb.legacyNested).toBe('retain');
    expect(old.read().fb.legacyNested).toBeUndefined();
  });
  it('negative detail has identical payload; new done marker follows successful acknowledgement', async () => {
    const responses = { '/api/feedback/detail': fixture('detail-ok') };
    const old = legacy(edited, responses),
      next = current(edited, responses);
    old.context.fbState.tags = ['остыло'];
    old.context.document.getElementById('fbComment').value =
      'synthetic comment';
    await old.api.fbSendDetail();
    await next.rating.sendDetail(['остыло'], 'synthetic comment');
    expect(next.calls).toEqual(old.calls);
    expect(next.read()).toEqual({ ...old.read(), done: true });
  });
  it('rejected detail is intentionally kept retryable instead of legacy false completion', async () => {
    const responses = { '/api/feedback/detail': fixture('detail-wrong-token') };
    const old = legacy(edited, responses),
      next = current(edited, responses);
    await old.api.fbSendDetail();
    await next.rating.sendDetail([], '');
    expect(next.calls).toEqual(old.calls);
    expect(old.read().fb.detailSent).toBe(true);
    expect(next.read()).toEqual(edited);
  });
  it('detail network outage leaves both records untouched without automatic retry', async () => {
    const responses = { '/api/feedback/detail': 'network' };
    const old = legacy(edited, responses),
      next = current(edited, responses);
    await old.api.fbSendDetail();
    await next.rating.sendDetail([], '');
    expect(next.calls).toEqual(old.calls);
    expect(next.read()).toEqual(old.read());
    expect(next.read()).toEqual(edited);
    expect(next.calls).toHaveLength(1);
  });
  it('identity keys and forget retain guest/visit/staff bytes across both implementations', () => {
    const old = legacy(seed),
      next = current(seed);
    expect(next.order.guestId()).toBe(old.api.guestId());
    expect(next.order.visitId()).toBe(old.api.guestSession());
    old.api.fbForget();
    next.order.forgetOrder();
    expect(next.storage.values).toEqual(old.storage.values);
    expect(next.session.values).toEqual(old.session.values);
    expect(next.storage.getItem('iskendy_staff_token')).toBe(
      'untouched-sentinel',
    );
  });
  it('rollback clears served/prompted/gone in both; new lastStatus stores the actual active state', () => {
    const active = { ...board, orders: [{ number: 997, status: 'preparing' }] };
    const initial = { ...seed, promptedAt: now, gone: true };
    const old = legacy(initial, {}, active);
    old.api.fbWatch();
    const next = advanceOrder(initial, active, now);
    expect(next.record).toEqual({ ...old.read(), lastStatus: 'preparing' });
    expect(next.effects).toEqual([]);
    expect(old.calls).toEqual([]);
  });
  it('initial ready snapshot stays silent like legacy; preparing to ready still signals once', () => {
    for (const previous of ['', 'preparing']) {
      const initial = { ...seed, n: 112, servedAt: 0, lastStatus: previous };
      const active = { ...board, orders: [{ number: 112, status: 'ready' }] };
      const old = legacy(initial, {}, active);
      old.context.status = 'ready';
      old.api.myWatch();
      old.api.myWatch();
      const first = advanceOrder(initial, active, now);
      const second = advanceOrder(first.record, active, now + 1);
      expect(first.effects.includes('ready') ? [112] : []).toEqual(old.signals);
      expect(second.effects).toEqual([]);
      expect(first.record).toMatchObject(old.read());
    }
  });
  it('served success retains legacy patch and records the served diagnostic status', async () => {
    const initial = { ...seed, servedAt: 0, lastStatus: 'ready' };
    const response = fixture('check-served-positive');
    const old = legacy(initial, { '/api/feedback/check': response });
    await old.api.fbAskServed(initial);
    expect(applyServedCheck(initial, response, now)).toEqual({
      ...old.read(),
      lastStatus: 'served',
    });
  });
  it('positive detail intentionally sends tags only and marks completion after acknowledgement', async () => {
    const initial = {
      ...edited,
      fb: { ...edited.fb, rating: 5, branch: 'positive' },
    };
    const next = current(initial, {
      '/api/feedback/detail': fixture('detail-ok'),
    });
    await next.rating.sendDetail(['Вкус'], '');
    expect(next.calls).toEqual([
      {
        path: '/api/feedback/detail',
        method: 'POST',
        body: { feedback_id: 1, edit_token: '<token>', tags: ['Вкус'] },
      },
    ]);
    expect(next.read()).toEqual({
      ...initial,
      done: true,
      fb: { ...initial.fb, detailSent: true },
    });
  });
  it('not_claimed intentionally clears invalid key without marking a failed create as rated', async () => {
    const responses = {
      '/api/feedback/check': fixture('check-served-positive'),
      '/api/feedback': fixture('feedback-not-claimed'),
    };
    const old = legacy(seed, responses),
      next = current(seed, responses);
    await old.api.fbSendRating(5);
    await next.rating.submit(5);
    expect(next.calls).toEqual([
      { path: '/api/feedback/check', method: 'GET', query: '?number=997' },
      ...old.calls,
    ]);
    expect(old.read().rated).toBe(true);
    expect(next.read()).toEqual({ ...seed, claim: '' });
  });
});
