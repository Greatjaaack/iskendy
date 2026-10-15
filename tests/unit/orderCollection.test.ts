import { describe, expect, it } from 'vitest';
import {
  addOrder,
  emptyOrders,
  migrateOrders,
  orderPosition,
  ordersForDay,
  patchCollectionOrder,
  removeOrder,
  sameOrder,
} from '../../src/domain/orderCollection';
import type { OrderRecord } from '../../src/storage/schemas';

const order = (n: number, d = '2026-10-09'): OrderRecord => ({
  n,
  d,
  claim: 'synthetic',
  extra: { retained: true },
});
const feedback = {
  id: 1,
  token: 'synthetic-edit',
  rating: 5,
  branch: 'positive',
  future: true,
} as const;
const collection = (count: number) =>
  Array.from({ length: count }, (_, index) => order(112 + index)).reduce(
    addOrder,
    emptyOrders(),
  );

describe('multiorder domain and non-destructive migration', () => {
  it('converts empty storage without creating a demo order', () => {
    expect(migrateOrders(null, null)).toEqual({
      ok: true,
      source: 'empty',
      collection: emptyOrders(),
    });
  });
  it('converts a legacy order with all rating and unknown fields, without changing the input bytes', () => {
    const original = { ...order(135), rated: true, done: true, fb: feedback };
    const bytes = JSON.stringify(original);
    expect(migrateOrders(bytes, null)).toEqual({
      ok: true,
      source: 'legacy',
      collection: { version: 1, orders: [original] },
    });
    expect(bytes).toBe(JSON.stringify(original));
  });
  it('preserves a valid collection envelope and ignores a stale legacy projection', () => {
    const saved = { ...collection(3), futureEnvelope: 'retained' };
    expect(
      migrateOrders(JSON.stringify(order(999)), JSON.stringify(saved)),
    ).toEqual({ ok: true, source: 'collection', collection: saved });
  });
  it.each(['{', 'null', '{}', '{"n":0,"d":"2026-10-09"}'])(
    'fails closed on invalid legacy source %s',
    (bytes) => {
      expect(migrateOrders(bytes, null)).toEqual({
        ok: false,
        reason: 'invalid-legacy',
      });
    },
  );
  it.each([
    '{',
    'null',
    '{}',
    '{"version":2,"orders":[]}',
    '{"version":1,"orders":[{}]}',
  ])(
    'never truncates a corrupt collection to its legacy projection %s',
    (bytes) => {
      expect(migrateOrders(JSON.stringify(order(112)), bytes)).toEqual({
        ok: false,
        reason: 'invalid-collection',
      });
    },
  );
  it('rejects duplicate identities in persisted collections rather than silently choosing a rating', () => {
    const duplicate = {
      version: 1,
      orders: [order(112), { ...order(112), rated: true }],
    };
    expect(migrateOrders(null, JSON.stringify(duplicate)).ok).toBe(false);
  });
  it.each([0, 1, 2, 3, 5])(
    'round-trips %i orders in insertion order',
    (count) => {
      const saved = collection(count);
      expect(migrateOrders(null, JSON.stringify(saved))).toEqual({
        ok: true,
        source: 'collection',
        collection: saved,
      });
      expect(orderPosition(saved, null)).toEqual({
        index: -1,
        total: count,
        previous: null,
        next: null,
      });
    },
  );
  it('does not enforce a global five-record cap across multiple backend days', () => {
    const saved = addOrder(collection(5), order(112, '2026-10-10'));
    expect(saved.orders).toHaveLength(6);
    expect(ordersForDay(saved, '2026-10-09')).toHaveLength(5);
    expect(ordersForDay(saved, '2026-10-10')).toHaveLength(1);
  });
  it('does not reset a rating or reorder cards on repeated QR/claim', () => {
    const saved = addOrder(collection(2), {
      ...order(135),
      fb: feedback,
      rated: true,
    });
    expect(addOrder(saved, { ...order(135), rated: false })).toBe(saved);
    expect(saved.orders.map(({ n }) => n)).toEqual([112, 113, 135]);
  });
  it('isolates identical numbers on different days', () => {
    const saved = addOrder(collection(1), order(112, '2026-10-10'));
    const updated = patchCollectionOrder(saved, order(112), {
      rated: true,
      fb: feedback,
    });
    expect(updated.orders[0]?.fb).toEqual(feedback);
    expect(updated.orders[1]?.fb).toBeUndefined();
    expect(sameOrder(saved.orders[0]!, saved.orders[1]!)).toBe(false);
  });
  it('keeps feedback independent for 112, 128 and 135 and preserves unknown fields', () => {
    const saved = [112, 128, 135]
      .map((n) => order(n))
      .reduce(addOrder, emptyOrders());
    const updated = patchCollectionOrder(saved, order(135), {
      rated: true,
      fb: feedback,
      n: 999,
      d: '2000-01-01',
    });
    expect(updated.orders.slice(0, 2)).toEqual(saved.orders.slice(0, 2));
    expect(updated.orders[2]).toEqual({
      ...order(135),
      rated: true,
      fb: feedback,
    });
    expect(saved.orders[2]?.rated).toBeUndefined();
  });
  it('retains future feedback fields when updating the same saved feedback', () => {
    const saved = addOrder(emptyOrders(), { ...order(135), fb: feedback });
    const known = {
      id: feedback.id,
      token: feedback.token,
      rating: feedback.rating,
      branch: feedback.branch,
    };
    expect(
      patchCollectionOrder(saved, order(135), {
        fb: { ...known, detailSent: true },
      }).orders[0]?.fb,
    ).toEqual({ ...feedback, detailSent: true });
  });
  it('does not carry unknown feedback fields into a different feedback identity', () => {
    const saved = addOrder(emptyOrders(), { ...order(135), fb: feedback });
    expect(
      patchCollectionOrder(saved, order(135), {
        fb: { id: 2, token: 'other', rating: 1, branch: 'negative' },
      }).orders[0]?.fb,
    ).not.toHaveProperty('future');
  });
  it('leaves a missing identity untouched', () => {
    const saved = collection(1);
    expect(patchCollectionOrder(saved, order(999), { rated: true })).toBe(
      saved,
    );
  });
  it('cannot wrap paging at the ends and does not select a missing record', () => {
    const saved = collection(3);
    expect(orderPosition(saved, order(112))).toMatchObject({
      index: 0,
      previous: null,
      next: order(113),
    });
    expect(orderPosition(saved, order(114))).toMatchObject({
      index: 2,
      previous: order(113),
      next: null,
    });
    expect(orderPosition(saved, order(999))).toMatchObject({
      index: -1,
      previous: null,
      next: null,
    });
  });
  it('a status change on another order cannot alter the selection or insertion order', () => {
    const saved = collection(3);
    const selected = order(113);
    const updated = patchCollectionOrder(saved, order(114), {
      lastStatus: 'ready',
    });
    expect(orderPosition(updated, selected).index).toBe(1);
    expect(updated.orders.map(({ n }) => n)).toEqual([112, 113, 114]);
  });
  it('validates incoming records and patches before modifying the collection', () => {
    const saved = collection(1);
    expect(() => addOrder(saved, order(0))).toThrow();
    expect(() =>
      patchCollectionOrder(saved, order(112), {
        fb: { ...feedback, rating: 0 },
      }),
    ).toThrow();
    expect(saved).toEqual(collection(1));
  });
});
describe('removing an order (ADR-019, «Убрать из моих заказов»)', () => {
  it('removes only the addressed date/number and keeps the others in order', () => {
    const three = collection(3);
    const next = removeOrder(three, { n: 113, d: '2026-10-09' });
    expect(next.orders.map((o) => o.n)).toEqual([112, 114]);
    expect(three.orders).toHaveLength(3);
  });
  it('leaves the same number on another day and a missing identity untouched', () => {
    const both = addOrder(collection(1), order(112, '2026-10-10'));
    expect(
      removeOrder(both, { n: 112, d: '2026-10-10' }).orders.map((o) => o.d),
    ).toEqual(['2026-10-09']);
    expect(removeOrder(both, { n: 999, d: '2026-10-09' })).toBe(both);
  });
  it('lets the guest add the same order again after removal', () => {
    const removed = removeOrder(collection(1), { n: 112, d: '2026-10-09' });
    expect(addOrder(removed, order(112)).orders).toHaveLength(1);
  });
});
