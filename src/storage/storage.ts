import { STORAGE_KEYS } from './keys';
import { orderRecordSchema, type OrderRecord } from './schemas';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Options = {
  local?: () => StorageLike;
  session?: () => StorageLike;
  now?: () => number;
  random?: () => number;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
};
export function createOrderStorage(options: Options = {}) {
  const local = options.local ?? (() => window.localStorage);
  const session = options.session ?? (() => window.sessionStorage);
  const now = options.now ?? Date.now,
    random = options.random ?? Math.random;
  const memory = new Map<string, string>();
  const volatile = new Set<string>();
  const listeners = new Set<() => void>();
  const read = (key: string, source: () => StorageLike): string | null => {
    if (volatile.has(key)) return memory.get(key) ?? null;
    try {
      const value = source().getItem(key);
      if (value === null) memory.delete(key);
      else memory.set(key, value);
      return value;
    } catch {
      return memory.get(key) ?? null;
    }
  };
  const write = (
    key: string,
    value: string | null,
    source: () => StorageLike,
  ): void => {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    try {
      if (value === null) source().removeItem(key);
      else source().setItem(key, value);
      volatile.delete(key);
    } catch {
      volatile.add(key); /* Private mode retains only an in-memory value. */
    }
  };
  const readOrder = (): OrderRecord | null => {
    try {
      const parsed = orderRecordSchema.safeParse(
        JSON.parse(read(STORAGE_KEYS.order, local) ?? 'null'),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  const notify = () => {
    for (const callback of listeners) callback();
  };
  const writeOrder = (record: OrderRecord | null): void => {
    write(
      STORAGE_KEYS.order,
      record === null ? null : JSON.stringify(orderRecordSchema.parse(record)),
      local,
    );
    notify();
  };
  const identity = (key: string, source: () => StorageLike): string => {
    const current = read(key, source);
    if (current && current.length <= 40) return current;
    const created =
      String(now() % 1e9) +
      random()
        .toString(36)
        .slice(2, key === STORAGE_KEYS.visit ? 8 : 10);
    write(key, created, source);
    return created;
  };
  const changed = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === STORAGE_KEYS.order || key === null) {
      volatile.delete(STORAGE_KEYS.order);
      notify();
    }
  };
  return {
    readOrder,
    writeOrder,
    readSnapshot: () => read(STORAGE_KEYS.order, local),
    patchOrder(
      number: number,
      patch: Partial<OrderRecord>,
    ): OrderRecord | null {
      const current = readOrder();
      if (!current || current.n !== number) return null;
      const next = { ...current, ...patch, n: current.n, d: current.d };
      writeOrder(next);
      return next;
    },
    forgetOrder: () => writeOrder(null),
    guestId: () => identity(STORAGE_KEYS.guest, local),
    visitId: () => identity(STORAGE_KEYS.visit, session),
    subscribe(callback: () => void): () => void {
      const target = options.target ?? window;
      if (listeners.size === 0) target.addEventListener('storage', changed);
      // The stable shared listener is removed only when the final consumer leaves.
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0)
          target.removeEventListener('storage', changed);
      };
    },
  };
}
export const orderStorage = createOrderStorage();
