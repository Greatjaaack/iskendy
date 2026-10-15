import { describe, expect, it, vi } from 'vitest';
import { createCollectionOwner } from '../../src/domain/order/collection-owner';
import type { Board } from '../../src/api/schemas/guest';
import type { OrderRecord } from '../../src/storage/schemas';
import fixture from '../fixtures/status-populated.json';
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup(records: OrderRecord[], board: Board | null = fixture as Board) {
  const state = { records, board };
  const patch = vi.fn((id: OrderRecord, changes: Partial<OrderRecord>) => {
    state.records = state.records.map((r) =>
      r.n === id.n && r.d === id.d ? { ...r, ...changes } : r,
    );
    return true;
  });
  const ready = vi.fn(),
    rating = vi.fn();
  const check = vi.fn(async () => ({
    ok: true as const,
    data: { ok: false as const, reason: 'not_served' },
  }));
  const owner = createCollectionOwner({
    readOrders: () => state.records,
    readBoard: () => state.board,
    patch,
    check,
    onReady: ready,
    onRatingPrompt: rating,
    promptDelaySec: () => 180,
  });
  return { state, patch, ready, rating, check, owner };
}
const order = (n: number, extra: Partial<OrderRecord> = {}): OrderRecord => ({
  n,
  d: fixture.date,
  seen: true,
  lastStatus: 'preparing',
  ...extra,
});
describe('collection effects and bounded checks', () => {
  it('signals every watched ready transition once, without selecting another order', async () => {
    const h = setup([order(112), order(110), order(135, { rated: true })], {
      ...fixture,
      orders: fixture.orders.map((r) => ({ ...r, status: 'ready' as const })),
    });
    h.owner.tick(1);
    await flush();
    h.owner.tick(2);
    await flush();
    expect(h.ready.mock.calls).toEqual([[112], [110]]);
    expect(h.rating).not.toHaveBeenCalled();
    expect(h.check).not.toHaveBeenCalled();
    expect(h.state.records[2]).toMatchObject({
      n: 135,
      rated: true,
      lastStatus: 'preparing',
    });
  });
  it('does not signal a transition which could not be saved', async () => {
    const h = setup([order(112)], {
      ...fixture,
      orders: fixture.orders.map((r) => ({ ...r, status: 'ready' as const })),
    });
    h.patch.mockReturnValue(false);
    h.owner.tick(1);
    await flush();
    expect(h.ready).not.toHaveBeenCalled();
  });
  it('reminders stay scoped and do not repeat', async () => {
    const h = setup([order(135, { servedAt: 1 }), order(136, { servedAt: 1 })]);
    h.owner.tick(180001);
    await flush();
    h.owner.tick(181001);
    await flush();
    expect(h.rating.mock.calls).toEqual([[135], [136]]);
  });
  it('keeps previous-day records intact and cancels checks after midnight', async () => {
    const h = setup([order(135), order(112, { d: '2026-10-06' })]);
    let signal: AbortSignal | undefined;
    h.check.mockImplementation((_n?: unknown, s?: unknown) => {
      signal = s as AbortSignal;
      return new Promise(() => {});
    });
    h.owner.tick(1);
    await flush();
    expect(h.check).toHaveBeenCalledTimes(1);
    h.state.board = { ...fixture, date: '2026-10-08' } as Board;
    h.owner.tick(2);
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(h.state.records).toHaveLength(2);
    expect(h.patch).not.toHaveBeenCalled();
  });
  it('checks at most one request concurrently and fairly skips per-order cooldown', async () => {
    const h = setup([order(135), order(136), order(137)]);
    h.owner.tick(0);
    await flush();
    h.owner.tick(1000);
    await flush();
    h.owner.tick(2000);
    await flush();
    h.owner.tick(3000);
    await flush();
    expect(h.check.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      135, 136, 137,
    ]);
    h.owner.tick(20000);
    await flush();
    expect(h.check).toHaveBeenCalledTimes(4);
  });
  it('blocks overlaps and preserves unrelated feedback fields on check completion', async () => {
    const h = setup([order(135), order(136)]);
    let done: (v: unknown) => void = () => {};
    h.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve as (v: unknown) => void;
        }),
    );
    h.owner.tick(0);
    h.owner.tick(1000);
    await flush();
    expect(h.check).toHaveBeenCalledTimes(1);
    h.state.records[0] = { ...h.state.records[0]!, extra: { retained: true } };
    done({ ok: true, data: { ok: true, number: 135, waitSeconds: 0 } });
    await flush();
    expect(h.state.records[0]).toMatchObject({
      servedAt: 0,
      lastStatus: 'served',
      extra: { retained: true },
    });
    expect(h.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ n: 135 }),
      expect.not.objectContaining({ extra: expect.anything() }),
    );
  });
  it('cancel prevents late writes and allows a new owner tick', async () => {
    const h = setup([order(135)]);
    h.check.mockImplementation(() => new Promise(() => {}));
    h.owner.tick(0);
    await flush();
    h.owner.cancel();
    h.owner.tick(1000);
    await flush();
    expect(h.check).toHaveBeenCalledTimes(2);
  });
  it('ignores disappearing or replaced records in late checks', async () => {
    const h = setup([order(135)]);
    let done: (v: unknown) => void = () => {};
    h.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve as (v: unknown) => void;
        }),
    );
    h.owner.tick(1);
    await flush();
    h.state.records = [];
    h.owner.tick(2);
    done({ ok: true, data: { ok: true, number: 135, waitSeconds: 0 } });
    await flush();
    expect(h.patch).not.toHaveBeenCalled();
  });
  it('handles empty and disconnected snapshots and failed checks without claims', async () => {
    const h = setup([], null);
    h.owner.tick(1);
    await flush();
    expect(h.check).not.toHaveBeenCalled();
    h.state.records = [order(135)];
    h.owner.tick(2);
    await flush();
    expect(h.check).not.toHaveBeenCalled();
    h.state.board = fixture as Board;
    h.check.mockRejectedValueOnce(new Error('network'));
    h.owner.tick(3);
    await flush();
    h.owner.tick(20003);
    await flush();
    expect(h.check).toHaveBeenCalledTimes(2);
  });
});
