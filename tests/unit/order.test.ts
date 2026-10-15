import { describe, expect, it, vi } from 'vitest';
import {
  advanceOrder,
  applyServedCheck,
  shouldCheckServed,
} from '../../src/domain/order/machine';
import {
  createSubscriptionService,
  parseOrderNumber,
} from '../../src/domain/order/subscribe';
import type { Board, Claim, FeedbackCheck } from '../../src/api/schemas/guest';
import type { ApiResult } from '../../src/api/errors';
import type { OrderRecord } from '../../src/storage/schemas';
const record: OrderRecord = {
  n: 112,
  d: '2026-10-07',
  seen: false,
  subAt: 0,
  lastStatus: '',
};
const board: Board = {
  date: record.d,
  orders: [],
  servedCount: 1,
  updatedAt: '',
  now: '13:00',
};
const active = (status: 'open' | 'preparing' | 'ready'): Board => ({
  ...board,
  orders: [
    { number: 112, status, acceptedAt: '', readyAt: null, servedAt: null },
  ],
});
const check = (
  reason: 'not_found' | 'not_served' | 'already',
): ApiResult<FeedbackCheck> => ({ ok: true, data: { ok: false, reason } });
const claimOk: ApiResult<Claim> = {
  ok: true,
  data: { ok: true, claimToken: '<token>', number: 112 },
};

describe('order lifecycle', () => {
  it('handles no record and a server business-day rollover', () => {
    expect(advanceOrder(null, board, 0).state).toBe('none');
    expect(advanceOrder(record, { ...board, date: '2026-10-08' }, 0)).toEqual({
      record: null,
      state: 'none',
      effects: ['forget'],
    });
  });
  it.each([false, true])(
    'uses the pending threshold at day start=%s',
    (start) => {
      const b = { ...board, servedCount: start ? 0 : 1 },
        limit = start ? 240_000 : 60_000;
      expect(advanceOrder(record, b, limit - 1).state).toBe('pending');
      expect(advanceOrder(record, b, limit).state).toBe('notFound');
      expect(advanceOrder({ n: 112, d: record.d }, b, limit).state).toBe(
        'pending',
      );
    },
  );
  it.each(['open', 'preparing', 'ready'] as const)(
    'heals pending/gone into active %s',
    (status) => {
      const result = advanceOrder({ ...record, gone: true }, active(status), 1);
      expect(result.state).toBe(status === 'ready' ? 'ready' : 'preparing');
      expect(result.record).toMatchObject({ seen: true, gone: false });
    },
  );
  it('signals ready once, and again after a reverted handoff', () => {
    const ready = advanceOrder(
      { ...record, lastStatus: 'preparing' },
      active('ready'),
      1,
    );
    expect(ready.effects).toEqual(['ready']);
    expect(advanceOrder(ready.record, active('ready'), 2).effects).toEqual([]);
    const reverted = advanceOrder(
      { ...ready.record!, servedAt: 3, promptedAt: 4 },
      active('ready'),
      5,
    );
    expect(reverted.effects).toEqual(['ready']);
    expect(reverted.record).toMatchObject({ servedAt: 0, promptedAt: 0 });
  });
  it('checks an absent previously seen order but never assumes it was served', () => {
    expect(advanceOrder({ ...record, seen: true }, board, 100)).toMatchObject({
      state: 'checking',
      effects: ['check-served'],
    });
    expect(advanceOrder({ ...record, gone: true }, board, 100).state).toBe(
      'notFound',
    );
  });
  it('prompts once after the configured delay and honors zero', () => {
    const issued = { ...record, servedAt: 10 };
    expect(advanceOrder(issued, board, 20).effects).toEqual([]);
    const prompted = advanceOrder(issued, board, 180_010);
    expect(prompted.effects).toEqual(['prompt-rating']);
    expect(advanceOrder(prompted.record, board, 999_999).effects).toEqual([]);
    expect(advanceOrder(issued, board, 10, 0).effects).toEqual([
      'prompt-rating',
    ]);
  });
  it.each([
    { rated: true },
    { done: true },
    { fb: { id: 1, token: '<token>', rating: 5, branch: 'positive' as const } },
  ])('does not re-prompt completed feedback', (patch) => {
    expect(advanceOrder({ ...record, ...patch }, board, 999_999)).toMatchObject(
      { state: 'rated', effects: [] },
    );
  });
  it.each([
    [{ lastStatus: 'ready' }, 'ready'],
    [{ seen: true }, 'preparing'],
    [{}, 'pending'],
  ] as const)(
    'retains last known state without new server data',
    (patch, state) => {
      expect(advanceOrder({ ...record, ...patch }, null, 10)).toMatchObject({
        state,
        effects: [],
      });
    },
  );
  it('applies each served-check result and ignores a mismatched response number', () => {
    expect(
      applyServedCheck(
        record,
        { ok: true, number: 112, reason: null, waitSeconds: 0 },
        5,
      ),
    ).toMatchObject({ servedAt: 5, gone: false });
    expect(
      applyServedCheck(
        record,
        { ok: true, number: 113, reason: null, waitSeconds: 0 },
        5,
      ),
    ).toEqual(record);
    expect(
      applyServedCheck(record, { ok: false, reason: 'already' }, 5),
    ).toMatchObject({ rated: true });
    expect(
      applyServedCheck(record, { ok: false, reason: 'not_found' }, 5),
    ).toMatchObject({ gone: true });
    expect(
      applyServedCheck(record, { ok: false, reason: 'not_served' }, 5),
    ).toEqual(record);
  });
  it('throttles served checks and prevents overlap', () => {
    expect(shouldCheckServed(null, 0, false)).toBe(true);
    expect(shouldCheckServed(0, 19_999, false)).toBe(false);
    expect(shouldCheckServed(0, 20_000, false)).toBe(true);
    expect(shouldCheckServed(null, 20_000, true)).toBe(false);
  });
});
describe('explicit subscription action', () => {
  it.each([
    '',
    '0',
    '1000',
    '2424',
    '100000',
    '100001',
    '1.5',
    '-1',
    'abc',
    '1111111',
  ])('rejects invalid %s before requests', async (input) => {
    const deps = { check: vi.fn(), claim: vi.fn() };
    expect(parseOrderNumber(input)).toBeNull();
    expect(
      await createSubscriptionService(deps)(input, board, 'guest', 0),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(deps.check).not.toHaveBeenCalled();
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it.each(['1', '999', '00112', ' 112 '])(
    'accepts the owner-approved guest number range: %s',
    (input) => {
      expect(parseOrderNumber(input)).toBe(Number(input));
    },
  );
  it('requires a server business date', async () => {
    expect(
      await createSubscriptionService({ check: vi.fn(), claim: vi.fn() })(
        '112',
        null,
        'guest',
        0,
      ),
    ).toMatchObject({ reason: 'unavailable' });
  });
  it('subscribes an active order with one claim and no redundant check', async () => {
    const deps = { check: vi.fn(), claim: vi.fn().mockResolvedValue(claimOk) };
    const result = await createSubscriptionService(deps)(
      '112',
      active('preparing'),
      'stable-guest',
      42,
    );
    expect(result).toMatchObject({
      ok: true,
      record: {
        n: 112,
        d: board.date,
        claim: '<token>',
        subAt: 42,
        seen: true,
      },
    });
    expect(deps.check).not.toHaveBeenCalled();
    expect(deps.claim).toHaveBeenCalledExactlyOnceWith({
      number: 112,
      guest: 'stable-guest',
    });
  });
  it.each(['not_found', 'not_served'] as const)(
    'handles a missing active number: %s',
    async (reason) => {
      const result = await createSubscriptionService({
        check: vi.fn().mockResolvedValue(check(reason)),
        claim: vi.fn().mockResolvedValue(claimOk),
      })('112', board, 'guest', 1);
      expect(result).toMatchObject({
        ok: true,
        pending: reason === 'not_found',
      });
    },
  );
  it.each([false, true])(
    'subscribes a served/already-rated order without claim (rated=%s)',
    async (rated) => {
      const claim = vi.fn();
      const result = await createSubscriptionService({
        check: vi.fn().mockResolvedValue(
          rated
            ? check('already')
            : {
                ok: true,
                data: { ok: true, reason: null, number: 112, waitSeconds: 0 },
              },
        ),
        claim,
      })('112', board, 'guest', 1);
      expect(result).toMatchObject({
        ok: true,
        alreadyServed: true,
        record: { rated, servedAt: 1 },
      });
      expect(claim).not.toHaveBeenCalled();
    },
  );
  it.each(['network', 'timeout'] as const)(
    'retains subscription without a token after %s and does not auto-repeat',
    async (kind) => {
      const claim = vi.fn().mockResolvedValue({ ok: false, error: { kind } });
      expect(
        await createSubscriptionService({ check: vi.fn(), claim })(
          '112',
          active('ready'),
          'guest',
          1,
        ),
      ).toMatchObject({ ok: true, record: { claim: '' } });
      expect(claim).toHaveBeenCalledOnce();
    },
  );
  it.each(['rate_limited', 'aborted', 'http'] as const)(
    'fails claim on %s without subscribing or retrying',
    async (kind) => {
      const claim = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { kind, status: 500 } });
      expect(
        await createSubscriptionService({ check: vi.fn(), claim })(
          '112',
          active('ready'),
          'guest',
          1,
        ),
      ).toMatchObject({ ok: false, reason: 'api' });
      expect(claim).toHaveBeenCalledOnce();
    },
  );
  it.each(['taken', 'too_many'] as const)(
    'surfaces %s as a business rejection',
    async (reason) => {
      expect(
        await createSubscriptionService({
          check: vi.fn(),
          claim: vi.fn().mockResolvedValue({
            ok: true,
            data: { ok: false, reason, message: 'server message' },
          }),
        })('112', active('ready'), 'guest', 1),
      ).toMatchObject({ reason: 'business', message: 'server message' });
    },
  );
  it('does not claim after a check network failure', async () => {
    const claim = vi.fn();
    expect(
      await createSubscriptionService({
        check: vi
          .fn()
          .mockResolvedValue({ ok: false, error: { kind: 'network' } }),
        claim,
      })('112', board, 'guest', 1),
    ).toMatchObject({ reason: 'api' });
    expect(claim).not.toHaveBeenCalled();
  });
  it('deduplicates repeated clicks and recovers after completion', async () => {
    let finish!: (value: ApiResult<Claim>) => void;
    const claim = vi.fn(
      () =>
        new Promise<ApiResult<Claim>>((resolve) => {
          finish = resolve;
        }),
    );
    const subscribe = createSubscriptionService({ check: vi.fn(), claim });
    const first = subscribe('112', active('ready'), 'guest', 1);
    expect(await subscribe('112', active('ready'), 'guest', 2)).toMatchObject({
      reason: 'busy',
    });
    finish(claimOk);
    expect((await first).ok).toBe(true);
    const second = subscribe('112', active('ready'), 'guest', 3);
    finish(claimOk);
    expect((await second).ok).toBe(true);
  });
});
