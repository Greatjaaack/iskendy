import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrderStorage, orderStorage } from '../../src/storage/storage';
import { STORAGE_KEYS } from '../../src/storage/keys';
import type { OrderRecord } from '../../src/storage/schemas';
const record: OrderRecord = {
  n: 112,
  d: '2026-10-07',
  seen: true,
  claim: '<token>',
  extra: { future: true },
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
describe('legacy-compatible storage', () => {
  it('matches the distinct legacy guest and visit random suffix lengths', () => {
    const storage = createOrderStorage({
      now: () => 1234567890,
      random: () => 0.123456789,
    });
    expect(storage.guestId()).toBe(
      '234567890' + (0.123456789).toString(36).slice(2, 10),
    );
    expect(storage.visitId()).toBe(
      '234567890' + (0.123456789).toString(36).slice(2, 8),
    );
  });
  it('round-trips the original record and unknown fields', () => {
    localStorage.setItem('iskendi_my_order', JSON.stringify(record));
    const storage = createOrderStorage();
    expect(storage.readOrder()).toEqual(record);
    storage.patchOrder(112, { servedAt: 100 });
    const legacy = JSON.parse(
      localStorage.getItem('iskendi_my_order') ?? 'null',
    ) as OrderRecord;
    expect(legacy.extra).toEqual({ future: true });
    expect(legacy.servedAt).toBe(100);
  });
  it('patches the latest value, not a stale closure, without changing order identity', () => {
    const storage = createOrderStorage();
    storage.writeOrder(record);
    localStorage.setItem(
      STORAGE_KEYS.order,
      JSON.stringify({ ...record, lastStatus: 'ready' }),
    );
    expect(
      storage.patchOrder(112, { claim: 'new', n: 999, d: '2000-01-01' }),
    ).toMatchObject({
      n: 112,
      d: '2026-10-07',
      lastStatus: 'ready',
      claim: 'new',
    });
    expect(storage.patchOrder(113, {})).toBeNull();
    storage.forgetOrder();
    expect(storage.readOrder()).toBeNull();
    expect(storage.patchOrder(112, {})).toBeNull();
  });
  it.each(['invalid JSON', '{}', 'null', '{"n":0,"d":"2026-10-07"}'])(
    'ignores malformed stored data %s',
    (value) => {
      localStorage.setItem(STORAGE_KEYS.order, value);
      expect(createOrderStorage().readOrder()).toBeNull();
    },
  );
  it('retains working in-memory state when all storage access throws', () => {
    const blocked = () => {
      throw new Error('Blocked');
    };
    const storage = createOrderStorage({
      local: blocked,
      session: blocked,
      now: () => 1234567890,
      random: () => 0.5,
    });
    expect(storage.readOrder()).toBeNull();
    storage.writeOrder(record);
    expect(storage.readOrder()).toEqual(record);
    const id = storage.guestId();
    expect(id).toBe('234567890i');
    expect(storage.guestId()).toBe(id);
    expect(storage.visitId()).toBe(id);
    storage.forgetOrder();
    expect(storage.readOrder()).toBeNull();
  });
  it('handles quota errors even when reading storage still works', () => {
    const quota = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    const storage = createOrderStorage({ local: () => quota });
    storage.writeOrder(record);
    expect(storage.readOrder()).toEqual(record);
    storage.forgetOrder();
    expect(storage.readSnapshot()).toBeNull();
  });
  it('preserves existing identity and uses separate visit storage', () => {
    localStorage.setItem(STORAGE_KEYS.guest, 'existing-guest');
    sessionStorage.setItem(STORAGE_KEYS.visit, 'existing-visit');
    expect(orderStorage.guestId()).toBe('existing-guest');
    expect(orderStorage.visitId()).toBe('existing-visit');
    localStorage.setItem(STORAGE_KEYS.guest, 'x'.repeat(41));
    expect(createOrderStorage().guestId().length).toBeLessThanOrEqual(40);
    expect(localStorage.getItem('iskendy_staff_token')).toBeNull();
  });
  it('uses one cross-tab listener with correct cleanup after repeated subscriptions', () => {
    const add = vi.spyOn(window, 'addEventListener'),
      remove = vi.spyOn(window, 'removeEventListener');
    const storage = createOrderStorage({ target: window });
    const a = vi.fn(),
      b = vi.fn();
    const stopA = storage.subscribe(a),
      stopB = storage.subscribe(b);
    storage.writeOrder(record);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(a).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEYS.order }),
    );
    expect(a).toHaveBeenCalledTimes(2);
    stopA();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
    stopB();
    expect(remove).toHaveBeenCalledWith('storage', add.mock.calls[0]?.[1]);
    const c = vi.fn();
    const stopC = storage.subscribe(c);
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEYS.order }),
    );
    expect(c).toHaveBeenCalledOnce();
    stopC();
  });
});
