import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGuestOrderStorage,
  createOrderBinding,
  SELECTED_ORDER_KEY,
} from '../../src/storage/guestOrderStorage';
import {
  createOrderCollectionStorage,
  ORDER_JOURNAL_PREFIX,
} from '../../src/storage/orderCollectionStorage';
import { createOrderStorage } from '../../src/storage/storage';
import type { OrderRecord } from '../../src/storage/schemas';
const order = (n: number, d = '2026-10-09'): OrderRecord => ({
  n,
  d,
  subAt: n,
  future: true,
});
const fb = {
  id: 9,
  token: 'synthetic',
  rating: 5,
  branch: 'positive',
  future: true,
} as const;
const tabSession = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
const tab = (session = tabSession()) =>
  createGuestOrderStorage({
    legacy: createOrderStorage(),
    session: () => session,
  });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
describe('live guest storage bindings', () => {
  it('migrates the original rated order before adding a new one and keeps a legacy projection', () => {
    const original = { ...order(135), rated: true, fb };
    localStorage.setItem('iskendi_my_order', JSON.stringify(original));
    const storage = tab();
    expect(storage.readOrder()).toEqual(original);
    expect(storage.add(order(112))).toBe(true);
    expect(storage.readOrders()).toEqual([original, order(112)]);
    expect(storage.readOrder()).toEqual(order(112));
    expect(JSON.parse(localStorage.getItem('iskendi_my_order')!)).toEqual(
      order(112),
    );
  });
  it('repeated QR selects the saved original without resetting feedback or insertion order', () => {
    const storage = tab();
    storage.add({ ...order(135), rated: true, fb });
    storage.add(order(112));
    expect(storage.add({ ...order(135), rated: false })).toBe(true);
    expect(storage.readOrder()).toEqual({ ...order(135), rated: true, fb });
    expect(storage.readOrders().map(({ n }) => n)).toEqual([135, 112]);
  });
  it('reload restores the same tab selection even when another tab changed the legacy projection', () => {
    const session = tabSession(),
      first = tab(session),
      second = tab();
    first.add(order(112));
    second.add(order(128));
    expect(first.readOrder()).toEqual(order(112));
    expect(tab(session).readOrder()).toEqual(order(112));
    expect(second.readOrder()).toEqual(order(128));
  });
  it('removes only selection when tracking another order or crossing a business date', () => {
    localStorage.setItem(
      'iskendi_my_order',
      JSON.stringify({ ...order(135), fb }),
    );
    const storage = tab();
    expect(storage.forgetOrder()).toBe(true);
    expect(storage.readOrder()).toBeNull();
    expect(storage.readOrders()).toEqual([{ ...order(135), fb }]);
    storage.add(order(112, '2026-10-10'));
    expect(storage.readOrders()).toHaveLength(2);
  });
  it('preserves the original if migration or adding another order cannot be written', () => {
    localStorage.setItem('iskendi_my_order', JSON.stringify(order(112)));
    const storage = tab();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    expect(storage.add(order(128))).toBe(false);
    expect(storage.forgetOrder()).toBe(false);
    expect(storage.readOrder()).toEqual(order(112));
  });
  it('patches feedback by date/number and never switches another tab selection', () => {
    const first = tab(),
      second = tab();
    first.add(order(112));
    second.add(order(135));
    second.add(order(135, '2026-10-10'));
    expect(second.patch(order(135), { rated: true, fb })).toBe(true);
    expect(first.readOrder()?.n).toBe(112);
    expect(second.read(order(135))).toEqual({ ...order(135), rated: true, fb });
    expect(second.read(order(135, '2026-10-10'))?.fb).toBeUndefined();
    expect(second.patch(order(999), {})).toBe(false);
  });
  it('selects an existing order but refuses missing identity', () => {
    const storage = tab();
    storage.add(order(112));
    storage.add(order(128));
    expect(storage.select(order(112))).toBe(true);
    expect(storage.readOrder()?.n).toBe(112);
    expect(storage.select(order(999))).toBe(false);
    expect(storage.readOrder()?.n).toBe(112);
  });
  it('scoped delta writes cannot overwrite unrelated newer feedback fields', () => {
    const first = tab(),
      second = tab();
    first.add(order(135));
    const binding = createOrderBinding(first, order(135));
    const before = binding.read()!;
    second.patch(order(135), { rated: true, fb });
    expect(binding.write({ ...before, lastStatus: 'served' })).toBe(true);
    expect(first.read(order(135))).toEqual({
      ...order(135),
      rated: true,
      fb,
      lastStatus: 'served',
    });
    expect(binding.write(order(999))).toBe(false);
    const unread = createOrderBinding(first, order(135));
    expect(unread.write(order(135))).toBe(false);
  });
  it('retains the original projection while reporting an invalid journal', () => {
    localStorage.setItem('iskendi_my_order', JSON.stringify(order(112)));
    localStorage.setItem(ORDER_JOURNAL_PREFIX + 'invalid', '{');
    const storage = tab();
    expect(storage.readOrder()).toEqual(order(112));
    expect(storage.patch(order(112), { rated: true })).toBe(false);
  });
  it('uses tab memory if session access fails', () => {
    const blocked = () => {
      throw Error('blocked');
    };
    const storage = createGuestOrderStorage({ session: blocked });
    storage.add(order(112));
    storage.add(order(128));
    expect(storage.readOrder()?.n).toBe(128);
    storage.forgetOrder();
    expect(storage.readOrder()).toBeNull();
  });
  it('ignores malformed selection and uses the original order', () => {
    localStorage.setItem('iskendi_my_order', JSON.stringify(order(112)));
    sessionStorage.setItem(SELECTED_ORDER_KEY, '{');
    expect(createGuestOrderStorage().readOrder()).toEqual(order(112));
  });
  it('one subscriber receives local and cross-tab changes with stable cleanup', () => {
    const storage = tab();
    const listener = vi.fn(),
      second = vi.fn();
    const stop = storage.subscribe(listener),
      stopSecond = storage.subscribe(second);
    storage.add(order(112));
    expect(listener).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new StorageEvent('storage', { key: ORDER_JOURNAL_PREFIX + 'external' }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    stopSecond();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it('imports a new legacy-tab order without changing this tab selection', () => {
    const storage = tab();
    storage.add(order(112));
    const stop = storage.subscribe(() => {});
    localStorage.setItem('iskendi_my_order', JSON.stringify(order(128)));
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'iskendi_my_order' }),
    );
    expect(storage.readOrders().map(({ n }) => n)).toEqual([112, 128]);
    expect(storage.readOrder()?.n).toBe(112);
    stop();
  });
  it('a late legacy projection cannot erase a saved rating', () => {
    const storage = tab();
    storage.add({ ...order(135), rated: true, fb });
    const stop = storage.subscribe(() => {});
    localStorage.setItem(
      'iskendi_my_order',
      JSON.stringify({ ...order(135), rated: false, extra: true }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'iskendi_my_order' }),
    );
    expect(storage.readOrder()).toEqual({
      ...order(135),
      rated: true,
      fb,
      extra: true,
    });
    stop();
  });
  it('imports newly confirmed feedback from a legacy tab without tokens in the selection key', () => {
    const storage = createGuestOrderStorage();
    storage.add(order(135));
    const stop = storage.subscribe(() => {});
    localStorage.setItem(
      'iskendi_my_order',
      JSON.stringify({ ...order(135), rated: true, done: true, fb }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'iskendi_my_order' }),
    );
    expect(storage.readOrder()).toEqual({
      ...order(135),
      rated: true,
      done: true,
      fb,
    });
    expect(sessionStorage.getItem(SELECTED_ORDER_KEY)).toBe(
      JSON.stringify({ n: 135, d: '2026-10-09' }),
    );
    stop();
  });
  it('leaving an empty entry is harmless and scoped unchanged writes append no journal operations', () => {
    const storage = tab();
    expect(storage.forgetOrder()).toBe(true);
    storage.add(order(112));
    const binding = createOrderBinding(storage, order(112)),
      before = binding.read()!,
      count = localStorage.length;
    expect(binding.write(before)).toBe(true);
    expect(localStorage.length).toBe(count);
    expect(createOrderCollectionStorage().read()).toMatchObject({ ok: true });
  });
});
describe('removing an order from this device', () => {
  it('removes the record, moves the selection to a remaining order and rewrites the projection', () => {
    const storage = tab();
    storage.add(order(112));
    storage.add(order(113));
    expect(storage.readOrder()).toEqual(order(113));
    expect(storage.remove({ n: 113, d: '2026-10-09' })).toBe(true);
    expect(storage.readOrders()).toEqual([order(112)]);
    expect(storage.readOrder()).toEqual(order(112));
    expect(JSON.parse(localStorage.getItem('iskendi_my_order')!)).toEqual(
      order(112),
    );
  });
  it('clears selection and the legacy projection when the last order goes', () => {
    const storage = tab();
    storage.add(order(112));
    expect(storage.remove({ n: 112, d: '2026-10-09' })).toBe(true);
    expect(storage.readOrders()).toEqual([]);
    expect(storage.readOrder()).toBeNull();
    expect(localStorage.getItem('iskendi_my_order')).toBeNull();
    // A fresh tab cannot re-import the removed order from the projection.
    expect(tab().readOrders()).toEqual([]);
  });
  it('keeps another selected order and notifies subscribers', () => {
    const storage = tab();
    storage.add(order(112));
    storage.add(order(113));
    const listener = vi.fn();
    const stop = storage.subscribe(listener);
    expect(storage.remove({ n: 112, d: '2026-10-09' })).toBe(true);
    expect(storage.readOrder()).toEqual(order(113));
    expect(listener).toHaveBeenCalled();
    stop();
  });
  it('refuses a missing identity', () => {
    const storage = tab();
    storage.add(order(112));
    expect(storage.remove({ n: 999, d: '2026-10-09' })).toBe(false);
    expect(storage.readOrders()).toEqual([order(112)]);
  });
});
describe('one business day (ADR-019)', () => {
  it('drops other days on the board date, notifies once and keeps the legacy key', () => {
    const storage = tab();
    storage.add(order(90, '2026-10-08'));
    storage.add(order(112, '2026-10-09'));
    const legacyBytes = localStorage.getItem('iskendi_my_order');
    const listener = vi.fn();
    const stop = storage.subscribe(listener);
    storage.keepDay('2026-10-09');
    expect(storage.readOrders()).toEqual([order(112, '2026-10-09')]);
    expect(localStorage.getItem('iskendi_my_order')).toBe(legacyBytes);
    expect(listener).toHaveBeenCalledTimes(1);
    storage.keepDay('2026-10-09');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});
