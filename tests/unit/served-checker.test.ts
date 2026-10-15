import { describe, expect, it, vi } from 'vitest';
import { createServedChecker } from '../../src/domain/order/served-checker';
import type { Board } from '../../src/api/schemas/guest';
import type { OrderRecord } from '../../src/storage/schemas';
import type { ApiResult } from '../../src/api/errors';
import type { FeedbackCheck } from '../../src/api/schemas/guest';
const empty: Board = {
  date: '2026-10-07',
  now: '13:00',
  orders: [],
  servedCount: 1,
  updatedAt: '',
};
const base: OrderRecord = {
  n: 112,
  d: empty.date,
  seen: true,
  subAt: 1,
  lastStatus: 'ready',
  claim: 'synthetic',
  servedAt: 0,
  rated: false,
  done: false,
};
function fixture() {
  let record: OrderRecord | null = { ...base },
    board: Board | null = empty;
  const check = vi
    .fn<
      (number: number, signal: AbortSignal) => Promise<ApiResult<FeedbackCheck>>
    >()
    .mockResolvedValue({ ok: true, data: { ok: false, reason: 'not_served' } });
  const write = vi.fn((next: OrderRecord) => {
    record = next;
  });
  const checker = createServedChecker({
    read: () => ({ record, board }),
    write,
    check,
  });
  return {
    checker,
    check,
    write,
    setRecord: (next: OrderRecord | null) => {
      record = next;
    },
    setBoard: (next: Board | null) => {
      board = next;
    },
    record: () => record,
  };
}
describe('single served-check owner', () => {
  it('checks at most every twenty seconds, including unsuccessful API results', async () => {
    const f = fixture();
    await f.checker.tick(0);
    await f.checker.tick(19999);
    expect(f.check).toHaveBeenCalledTimes(1);
    f.check.mockResolvedValue({ ok: false, error: { kind: 'rate_limited' } });
    await f.checker.tick(20000);
    await f.checker.tick(39999);
    expect(f.check).toHaveBeenCalledTimes(2);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('blocks overlapping requests', async () => {
    const f = fixture();
    let finish!: (r: ApiResult<FeedbackCheck>) => void;
    f.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = f.checker.tick(0);
    await f.checker.tick(30000);
    expect(f.check).toHaveBeenCalledTimes(1);
    finish({ ok: true, data: { ok: false, reason: 'not_served' } });
    await first;
  });
  it.each(['pending', 'no-board', 'new-day', 'active', 'none'] as const)(
    'does not check for %s',
    async (state) => {
      const f = fixture();
      if (state === 'pending') f.setRecord({ ...base, seen: false });
      if (state === 'no-board') f.setBoard(null);
      if (state === 'new-day') f.setBoard({ ...empty, date: '2026-10-08' });
      if (state === 'active')
        f.setBoard({
          ...empty,
          orders: [
            {
              number: 112,
              status: 'ready',
              acceptedAt: '',
              readyAt: null,
              servedAt: null,
            },
          ],
        });
      if (state === 'none') f.setRecord(null);
      await f.checker.tick(0);
      expect(f.check).not.toHaveBeenCalled();
    },
  );
  it('applies confirmed served status and then stops checking', async () => {
    const f = fixture();
    f.check.mockResolvedValue({
      ok: true,
      data: { ok: true, reason: null, number: 112, waitSeconds: 5 },
    });
    await f.checker.tick(100);
    expect(f.record()).toMatchObject({
      n: 112,
      servedAt: 100,
      lastStatus: 'served',
    });
    await f.checker.tick(30000);
    expect(f.check).toHaveBeenCalledTimes(1);
  });
  it.each(['not_found', 'already'] as const)(
    'applies %s without claiming again',
    async (reason) => {
      const f = fixture();
      f.check.mockResolvedValue({ ok: true, data: { ok: false, reason } });
      await f.checker.tick(100);
      expect(f.record()).toMatchObject(
        reason === 'not_found' ? { gone: true } : { rated: true },
      );
    },
  );
  it.each(['another-order', 'new-day', 'reappeared', 'forgotten'] as const)(
    'rejects a late result after %s',
    async (change) => {
      const f = fixture();
      let finish!: (r: ApiResult<FeedbackCheck>) => void;
      f.check.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = f.checker.tick(100);
      if (change === 'another-order')
        f.setRecord({ ...base, n: 113, subAt: 200 });
      if (change === 'new-day') f.setBoard({ ...empty, date: '2026-10-08' });
      if (change === 'reappeared')
        f.setBoard({
          ...empty,
          orders: [
            {
              number: 112,
              status: 'ready',
              acceptedAt: '',
              readyAt: null,
              servedAt: null,
            },
          ],
        });
      if (change === 'forgotten') f.setRecord(null);
      finish({
        ok: true,
        data: { ok: true, reason: null, number: 112, waitSeconds: 1 },
      });
      await pending;
      expect(f.write).not.toHaveBeenCalled();
    },
  );
  it('cancels in-flight requests and ignores their responses', async () => {
    const f = fixture();
    let finish!: (r: ApiResult<FeedbackCheck>) => void;
    f.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = f.checker.tick(100);
    f.checker.cancel();
    expect(f.check.mock.calls[0]![1].aborted).toBe(true);
    finish({
      ok: true,
      data: { ok: true, reason: null, number: 112, waitSeconds: 1 },
    });
    await pending;
    expect(f.write).not.toHaveBeenCalled();
  });
});
