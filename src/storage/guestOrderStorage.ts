import {
  createOrderCollectionStorage,
  ORDER_JOURNAL_PREFIX,
} from './orderCollectionStorage';
import { createOrderStorage, orderStorage } from './storage';
import { orderRecordSchema, type OrderRecord } from './schemas';
import { sameOrder, type OrderIdentity } from '../domain/orderCollection';
import { STORAGE_KEYS } from './keys';

export const SELECTED_ORDER_KEY = 'iskendy_selected_order_v1';
type Legacy = ReturnType<typeof createOrderStorage>;
type Journal = ReturnType<typeof createOrderCollectionStorage>;
/** The journal owns records; session storage owns this tab's selection.
 * The legacy key remains a single-record projection for rollback compatibility.
 */
export function createGuestOrderStorage(
  options: {
    legacy?: Legacy;
    journal?: Journal;
    session?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  } = {},
) {
  const legacy = options.legacy ?? orderStorage;
  const journal = options.journal ?? createOrderCollectionStorage();
  const session = options.session ?? (() => window.sessionStorage);
  const listeners = new Set<() => void>();
  let volatileSelection: OrderIdentity | null | undefined;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const selectIdentity = (identity: OrderIdentity | null) => {
    try {
      if (identity)
        session().setItem(
          SELECTED_ORDER_KEY,
          JSON.stringify({ n: identity.n, d: identity.d }),
        );
      else session().removeItem(SELECTED_ORDER_KEY);
      volatileSelection = undefined;
    } catch {
      volatileSelection = identity;
    }
  };
  const selected = (): OrderIdentity | null => {
    if (volatileSelection !== undefined) return volatileSelection;
    try {
      const bytes = session().getItem(SELECTED_ORDER_KEY);
      if (bytes !== null) {
        const parsed = orderRecordSchema.safeParse(JSON.parse(bytes));
        if (parsed.success) return { n: parsed.data.n, d: parsed.data.d };
      }
    } catch {
      /* Keep the original legacy record available if session access fails. */
    }
    const record = legacy.readOrder();
    const identity = record ? { n: record.n, d: record.d } : null;
    if (identity) selectIdentity(identity);
    return identity;
  };
  const readOrders = (): OrderRecord[] => {
    const result = journal.read();
    if (result.ok) return result.collection.orders;
    const fallback = legacy.readOrder();
    return fallback ? [fallback] : [];
  };
  const read = (identity: OrderIdentity): OrderRecord | null =>
    readOrders().find((record) => sameOrder(record, identity)) ?? null;
  const readOrder = (): OrderRecord | null => {
    const identity = selected();
    if (!identity) return null;
    return read(identity);
  };
  const mirror = (record: OrderRecord) => {
    const identity = selected();
    if (identity && sameOrder(identity, record)) legacy.writeOrder(record);
  };
  const patch = (
    identity: OrderIdentity,
    changes: Partial<OrderRecord>,
  ): boolean => {
    const result = journal.patch(identity, changes);
    if (!result.ok) return false;
    const record = result.collection.orders.find((item) =>
      sameOrder(item, identity),
    );
    if (!record) return false;
    mirror(record);
    notify();
    return true;
  };
  const adoptLegacy = () => {
    const candidate = legacy.readOrder();
    if (!candidate) return;
    const existing = read(candidate);
    if (!existing) {
      journal.add(candidate);
      return;
    }
    // A late projection cannot reset status, identity or ratings in the journal.
    // Import newly confirmed feedback and future fields absent from the journal.
    const additions: Partial<OrderRecord> = {};
    for (const [key, value] of Object.entries(candidate)) {
      if (!(key in existing)) additions[key] = value;
    }
    if (candidate.rated && !existing.rated) additions.rated = true;
    if (candidate.done && !existing.done) additions.done = true;
    if (Object.keys(additions).length) journal.patch(existing, additions);
  };
  const changed = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === STORAGE_KEYS.order) adoptLegacy();
    if (
      key === null ||
      key === STORAGE_KEYS.order ||
      key?.startsWith(ORDER_JOURNAL_PREFIX)
    )
      notify();
  };
  return {
    readOrder,
    readOrders,
    read,
    patch,
    readSnapshot: () => JSON.stringify(readOrder()),
    readCollectionSnapshot: () => JSON.stringify(readOrders()),
    add(record: OrderRecord): boolean {
      const result = journal.add(record);
      if (!result.ok) return false;
      const saved = result.collection.orders.find((item) =>
        sameOrder(item, record),
      );
      if (!saved) return false;
      selectIdentity(saved);
      legacy.writeOrder(saved);
      notify();
      return true;
    },
    select(identity: OrderIdentity): boolean {
      const record = read(identity);
      if (!record) return false;
      selectIdentity(record);
      legacy.writeOrder(record);
      notify();
      return true;
    },
    /** «Убрать из моих заказов»: the projection never keeps a removed order, so no tab re-imports it. */
    remove(identity: OrderIdentity): boolean {
      if (!read(identity)) return false;
      const wasSelected = sameOrder(selected() ?? { n: -1, d: '' }, identity);
      const result = journal.remove(identity);
      if (!result.ok) return false;
      const remaining = result.collection.orders;
      const projected = legacy.readOrder();
      if (wasSelected) {
        const next =
          [...remaining].reverse().find((order) => order.d === identity.d) ??
          null;
        selectIdentity(next);
        if (next) legacy.writeOrder(next);
        else legacy.forgetOrder();
      } else if (projected && sameOrder(projected, identity)) {
        const current = readOrder();
        if (current) legacy.writeOrder(current);
        else legacy.forgetOrder();
      }
      notify();
      return true;
    },
    /** ADR-019: keep only the board's business day; the legacy projection is untouched. */
    keepDay(date: string): void {
      const before = readOrders().length;
      const result = journal.keepDay(date);
      if (result.ok && result.collection.orders.length !== before) notify();
    },
    // Leaving a detail/starting another order never deletes an earlier claim or rating.
    forgetOrder() {
      if (!journal.migrate().ok) return false;
      selectIdentity(null);
      legacy.forgetOrder();
      notify();
      return true;
    },
    guestId: legacy.guestId,
    visitId: legacy.visitId,
    subscribe(listener: () => void) {
      const target = options.target ?? window;
      if (!listeners.size) target.addEventListener('storage', changed);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) target.removeEventListener('storage', changed);
      };
    },
  };
}
export const guestOrderStorage = createGuestOrderStorage();

/** A scoped binding writes only the fields changed since its own latest read.
 * A stale whole-record write cannot reset unrelated fields written by another tab.
 */
export function createOrderBinding(
  storage: ReturnType<typeof createGuestOrderStorage>,
  identity: OrderIdentity,
) {
  let baseline: OrderRecord | null = null;
  return {
    read: () => (baseline = storage.read(identity)),
    write(record: OrderRecord): boolean {
      if (!baseline || !sameOrder(baseline, record)) return false;
      const patch: Partial<OrderRecord> = {};
      for (const [key, value] of Object.entries(record)) {
        if (
          key !== 'n' &&
          key !== 'd' &&
          JSON.stringify(value) !== JSON.stringify(baseline[key])
        )
          patch[key] = value;
      }
      return !Object.keys(patch).length || storage.patch(identity, patch);
    },
  };
}
