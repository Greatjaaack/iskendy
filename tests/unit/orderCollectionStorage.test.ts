import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrderCollectionStorage,
  ORDER_JOURNAL_PREFIX,
} from '../../src/storage/orderCollectionStorage';
import type { OrderRecord } from '../../src/storage/schemas';
const order = (n: number, d = '2026-10-09'): OrderRecord => ({
  n,
  d,
  future: { keep: true },
});
const fb = {
  id: 9,
  token: 'synthetic-edit',
  rating: 5,
  branch: 'positive',
  future: true,
} as const;
const legacy = 'iskendi_my_order';
let id = 0;
const storage = () =>
  createOrderCollectionStorage({ id: () => String(++id).padStart(4, '0') });
beforeEach(() => {
  localStorage.clear();
  id = 0;
});

describe('additive order journal', () => {
  it('does not write storage on read or empty migration', () => {
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: { orders: [] },
    });
    expect(storage().migrate()).toMatchObject({
      ok: true,
      collection: { orders: [] },
    });
    expect(localStorage.length).toBe(0);
  });
  it('migrates once, retains legacy bytes and staff storage, and survives a new instance', () => {
    const record = { ...order(135), rated: true, fb };
    const bytes = JSON.stringify(record);
    localStorage.setItem(legacy, bytes);
    localStorage.setItem('iskendy_staff_token', 'synthetic-untouched');
    expect(storage().migrate()).toMatchObject({
      ok: true,
      collection: { orders: [record] },
    });
    expect(localStorage.getItem(legacy)).toBe(bytes);
    expect(localStorage.getItem('iskendy_staff_token')).toBe(
      'synthetic-untouched',
    );
    expect(storage().migrate()).toMatchObject({
      ok: true,
      collection: { orders: [record] },
    });
    expect(localStorage.length).toBe(3);
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: { orders: [record] },
    });
  });
  it.each([1, 2, 3, 5])(
    'preserves %i insertions across reload and repeated QR',
    (count) => {
      const first = storage();
      for (let index = 0; index < count; index++) first.add(order(112 + index));
      const keys = localStorage.length;
      expect(storage().add(order(112))).toMatchObject({ ok: true });
      expect(localStorage.length).toBe(keys);
      expect(storage().read()).toMatchObject({
        ok: true,
        collection: {
          orders: Array.from({ length: count }, (_, index) =>
            order(112 + index),
          ),
        },
      });
    },
  );
  it('does not adopt a stale legacy projection after the first migration', () => {
    localStorage.setItem(legacy, JSON.stringify(order(112)));
    storage().migrate();
    localStorage.setItem(legacy, JSON.stringify(order(999)));
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: { orders: [order(112)] },
    });
  });
  it('preserves concurrent additions from two tabs even with the same logical sequence', () => {
    const first = storage(),
      second = storage();
    const nativeSet = localStorage.setItem.bind(localStorage);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    let interleaved = false;
    set.mockImplementation((key, value) => {
      if (!interleaved && key.startsWith(ORDER_JOURNAL_PREFIX)) {
        interleaved = true;
        second.add(order(128));
      }
      nativeSet(key, value);
    });
    first.add(order(112));
    expect(first.read()).toMatchObject({
      ok: true,
      collection: { orders: [order(112), order(128)] },
    });
    expect(second.read()).toEqual(first.read());
  });
  it('merges independent concurrent patches to one order without a whole-record overwrite', () => {
    const first = storage(),
      second = storage();
    first.add(order(135));
    const nativeSet = localStorage.setItem.bind(localStorage);
    let interleaved = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      if (!interleaved && key.startsWith(ORDER_JOURNAL_PREFIX)) {
        interleaved = true;
        second.patch(order(135), { lastStatus: 'served' });
      }
      nativeSet(key, value);
    });
    first.patch(order(135), { rated: true, fb });
    expect(second.read()).toMatchObject({
      ok: true,
      collection: {
        orders: [{ ...order(135), lastStatus: 'served', rated: true, fb }],
      },
    });
  });
  it('keeps ratings on different orders and dates independent', () => {
    const first = storage();
    first.add(order(112));
    first.add(order(135));
    first.add(order(135, '2026-10-10'));
    first.patch(order(135), { rated: true, fb, n: 999, d: '2000-01-01' });
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: {
        orders: [
          order(112),
          { ...order(135), rated: true, fb },
          order(135, '2026-10-10'),
        ],
      },
    });
  });
  it('never claims an interrupted rating saved without a successful patch', () => {
    const first = storage();
    first.add(order(135));
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: { orders: [order(135)] },
    });
  });
  it('does not append a patch for a missing identity', () => {
    const first = storage();
    first.add(order(112));
    const count = localStorage.length;
    expect(first.patch(order(999), { rated: true })).toMatchObject({
      ok: true,
    });
    expect(localStorage.length).toBe(count);
  });
  it('rejects malformed source bytes without changing them', () => {
    localStorage.setItem(legacy, '{');
    expect(storage().add(order(112))).toEqual({
      ok: false,
      reason: 'invalid-legacy',
    });
    expect(localStorage.getItem(legacy)).toBe('{');
    expect(localStorage.length).toBe(1);
  });
  it('rejects invalid journal operations without falling back to legacy or appending', () => {
    localStorage.setItem(ORDER_JOURNAL_PREFIX + 'invalid', '{}');
    localStorage.setItem(legacy, JSON.stringify(order(112)));
    expect(storage().read()).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(storage().add(order(128))).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(localStorage.length).toBe(2);
  });
  it('distinguishes malformed journal JSON from storage denial without replacing it', () => {
    localStorage.setItem(ORDER_JOURNAL_PREFIX + 'invalid', '{');
    expect(storage().read()).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(storage().patch(order(112), { rated: true })).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(localStorage.getItem(ORDER_JOURNAL_PREFIX + 'invalid')).toBe('{');
  });
  it('reports blocked storage explicitly', () => {
    const first = createOrderCollectionStorage({
      local: () => {
        throw Error('blocked');
      },
    });
    expect(first.read()).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(first.migrate()).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
  });
  it('leaves the legacy record intact if migration cannot be durably written', () => {
    localStorage.setItem(legacy, JSON.stringify(order(112)));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    expect(storage().migrate()).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
    expect(storage().add(order(128))).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
    expect(localStorage.length).toBe(1);
  });
  it('reports a failed rating write instead of marking the order rated', () => {
    const first = storage();
    first.add(order(135));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    expect(first.patch(order(135), { rated: true, fb })).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
    expect(first.read()).toMatchObject({
      ok: true,
      collection: { orders: [order(135)] },
    });
    expect(first.add(order(128))).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
  });
  it('refuses an operation key collision instead of overwriting a saved order', () => {
    const first = createOrderCollectionStorage({ id: () => 'same' });
    first.add(order(112));
    expect(first.add(order(128))).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
    expect(first.read()).toMatchObject({
      ok: true,
      collection: { orders: [order(112)] },
    });
  });
  it('validates records, identities and patches before writing', () => {
    const first = storage();
    expect(first.add(order(0))).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(first.patch(order(0), {})).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(first.patch(order(112), { fb: { ...fb, rating: 0 } })).toEqual({
      ok: false,
      reason: 'invalid-collection',
    });
    expect(localStorage.length).toBe(0);
  });
  it('can generate unique opaque operation keys using native crypto', () => {
    const first = createOrderCollectionStorage();
    first.add(order(112));
    first.add(order(128));
    expect(localStorage.length).toBe(2);
    expect(localStorage.key(0)).toMatch(/^iskendy_orders_v1:[0-9a-f]{32}$/);
  });
});
describe('journal removal', () => {
  it('appends a remove operation that survives a new instance and later patches', () => {
    const journal = storage();
    journal.add(order(112));
    journal.add(order(113));
    expect(journal.remove({ n: 112, d: '2026-10-09' })).toMatchObject({
      ok: true,
      collection: { orders: [order(113)] },
    });
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: { orders: [order(113)] },
    });
    // A late patch from another tab cannot resurrect the removed order.
    expect(
      storage().patch({ n: 112, d: '2026-10-09' }, { lastStatus: 'ready' }),
    ).toMatchObject({ ok: true, collection: { orders: [order(113)] } });
  });
  it('does not append anything for a missing identity', () => {
    const journal = storage();
    journal.add(order(112));
    const keys = localStorage.length;
    journal.remove({ n: 999, d: '2026-10-09' });
    expect(localStorage.length).toBe(keys);
  });
  it('removes a migrated legacy order without falling back to the legacy bytes', () => {
    localStorage.setItem(legacy, JSON.stringify(order(135)));
    expect(storage().remove({ n: 135, d: '2026-10-09' })).toMatchObject({
      ok: true,
      collection: { orders: [] },
    });
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: { orders: [] },
    });
  });
});
describe('compaction and one business day (ADR-019)', () => {
  const keys = () =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith(ORDER_JOURNAL_PREFIX),
    );
  it('folds a long journal into one snapshot without changing the collection', () => {
    const journal = storage();
    journal.add(order(112));
    journal.add(order(113));
    for (let i = 0; i < 1500; i++)
      localStorage.setItem(
        ORDER_JOURNAL_PREFIX + 'bulk' + i,
        JSON.stringify({
          sequence: 3 + i,
          kind: 'patch',
          identity: { n: 112, d: '2026-10-09' },
          patch: { lastStatus: i % 2 ? 'ready' : 'preparing', seen: true },
        }),
      );
    const before = storage().read();
    journal.compact();
    expect(keys().length).toBeLessThanOrEqual(2);
    expect(storage().read()).toEqual(before);
    expect(storage().read()).toMatchObject({
      ok: true,
      collection: {
        orders: [
          // The last of the 1500 patches (i = 1499) says «ready».
          { ...order(112), lastStatus: 'ready', seen: true },
          order(113),
        ],
      },
    });
  });
  it('compacts on its own once the journal has more than 20 keys', () => {
    const journal = storage();
    journal.add(order(112));
    for (let i = 0; i < 25; i++)
      journal.patch({ n: 112, d: '2026-10-09' }, { subAt: i });
    expect(keys().length).toBeLessThanOrEqual(21);
    expect(storage().read()).toMatchObject({
      collection: { orders: [{ n: 112, subAt: 24, future: { keep: true } }] },
    });
  });
  it('keeps a write another tab makes while this tab compacts', () => {
    const journal = storage();
    for (let i = 0; i < 5; i++) journal.add(order(100 + i));
    const native = Storage.prototype.setItem;
    let injected = false;
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        native.call(this, key, value);
        if (!injected && JSON.parse(value).kind === 'snapshot') {
          injected = true;
          // Another tab appended after our read but before our deletions.
          native.call(
            this,
            ORDER_JOURNAL_PREFIX + 'other-tab',
            JSON.stringify({ sequence: 2, kind: 'add', record: order(200) }),
          );
        }
      });
    journal.compact();
    spy.mockRestore();
    expect(injected).toBe(true);
    const result = storage().read();
    expect(result.ok && result.collection.orders.map((o) => o.n)).toEqual([
      100, 101, 102, 103, 104, 200,
    ]);
  });
  it('never replays absorbed operations if deletion stopped half way', () => {
    const journal = storage();
    journal.add(order(112));
    journal.patch({ n: 112, d: '2026-10-09' }, { lastStatus: 'preparing' });
    journal.patch({ n: 112, d: '2026-10-09' }, { lastStatus: 'ready' });
    const remove = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementationOnce(() => {
        throw new Error('tab killed');
      });
    journal.compact();
    remove.mockRestore();
    expect(storage().read()).toMatchObject({
      collection: { orders: [{ n: 112, lastStatus: 'ready' }] },
    });
  });
  it('keeps only the business day of the board and never touches the legacy key', () => {
    localStorage.setItem(legacy, JSON.stringify(order(90, '2026-10-08')));
    const journal = storage();
    journal.add(order(90, '2026-10-08'));
    journal.add(order(112, '2026-10-09'));
    journal.keepDay('2026-10-09');
    expect(storage().read()).toMatchObject({
      collection: { orders: [order(112, '2026-10-09')] },
    });
    expect(JSON.parse(localStorage.getItem(legacy)!)).toEqual(
      order(90, '2026-10-08'),
    );
    const count = keys().length;
    journal.keepDay('2026-10-09');
    expect(keys().length).toBe(count);
  });
  it('parses the journal once until its keys change', () => {
    const journal = storage();
    journal.add(order(112));
    journal.read();
    const get = vi.spyOn(Storage.prototype, 'getItem');
    journal.read();
    journal.read();
    expect(
      get.mock.calls.filter(([key]) => key.startsWith(ORDER_JOURNAL_PREFIX)),
    ).toHaveLength(0);
    get.mockRestore();
    journal.add(order(113));
    expect(journal.read()).toMatchObject({
      collection: { orders: [order(112), order(113)] },
    });
  });
});
