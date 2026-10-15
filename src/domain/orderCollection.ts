import * as z from 'zod/mini';
import { orderRecordSchema, type OrderRecord } from '../storage/schemas';

/** Local identity mirrors the backend claim's date/number key, not an API orderId. */
export type OrderIdentity = Pick<OrderRecord, 'd' | 'n'>;
export const sameOrder = (a: OrderIdentity, b: OrderIdentity): boolean =>
  a.d === b.d && a.n === b.n;

const collectionSchema = z.looseObject({
  version: z.literal(1),
  orders: z.array(orderRecordSchema),
});
export type OrderCollection = z.infer<typeof collectionSchema>;
export const emptyOrders = (): OrderCollection => ({ version: 1, orders: [] });

export type MigrationResult =
  | {
      ok: true;
      collection: OrderCollection;
      source: 'empty' | 'legacy' | 'collection';
    }
  | { ok: false; reason: 'invalid-legacy' | 'invalid-collection' };

/** Pure conversion: the caller retains both source bytes until durable write succeeds.
 * An existing collection is authoritative; a stale legacy projection cannot replace it.
 * A corrupt collection never silently falls back to the single-order projection.
 */
export function migrateOrders(
  legacyBytes: string | null,
  collectionBytes: string | null,
): MigrationResult {
  const source = collectionBytes !== null ? 'collection' : 'legacy';
  const bytes = collectionBytes ?? legacyBytes;
  if (bytes === null)
    return { ok: true, collection: emptyOrders(), source: 'empty' };
  try {
    const parsed: unknown = JSON.parse(bytes);
    if (source === 'collection') {
      const result = collectionSchema.safeParse(parsed);
      if (
        result.success &&
        !result.data.orders.some((order, index, orders) =>
          orders.slice(0, index).some((earlier) => sameOrder(earlier, order)),
        )
      )
        return { ok: true, collection: result.data, source };
    } else {
      const result = orderRecordSchema.safeParse(parsed);
      if (result.success)
        return {
          ok: true,
          collection: { version: 1, orders: [result.data] },
          source,
        };
    }
  } catch {
    /* Leave malformed source bytes untouched. */
  }
  return {
    ok: false,
    reason: source === 'collection' ? 'invalid-collection' : 'invalid-legacy',
  };
}

/** Repeated claim/QR is idempotent and cannot reset a saved rating or reorder cards. */
export function addOrder(
  collection: OrderCollection,
  input: OrderRecord,
): OrderCollection {
  const record = orderRecordSchema.parse(input);
  if (collection.orders.some((order) => sameOrder(order, record)))
    return collection;
  return { ...collection, orders: [...collection.orders, record] };
}

/** Only the explicitly addressed order changes; identity fields cannot be patched. */
export function patchCollectionOrder(
  collection: OrderCollection,
  identity: OrderIdentity,
  patch: Partial<OrderRecord>,
): OrderCollection {
  if (!collection.orders.some((order) => sameOrder(order, identity)))
    return collection;
  return {
    ...collection,
    orders: collection.orders.map((order) => {
      if (!sameOrder(order, identity)) return order;
      const fb =
        patch.fb &&
        order.fb &&
        patch.fb.id === order.fb.id &&
        patch.fb.token === order.fb.token
          ? { ...order.fb, ...patch.fb }
          : patch.fb;
      return orderRecordSchema.parse({
        ...order,
        ...patch,
        ...(patch.fb ? { fb } : {}),
        n: order.n,
        d: order.d,
      });
    }),
  };
}

/** «Убрать из моих заказов» (ADR-019): local only, the backend quota is not returned. */
export function removeOrder(
  collection: OrderCollection,
  identity: OrderIdentity,
): OrderCollection {
  if (!collection.orders.some((order) => sameOrder(order, identity)))
    return collection;
  return {
    ...collection,
    orders: collection.orders.filter((order) => !sameOrder(order, identity)),
  };
}

export function ordersForDay(
  collection: OrderCollection,
  date: string,
): OrderRecord[] {
  return collection.orders.filter((order) => order.d === date);
}

/** Selection is view state, not persisted shared collection state. No wrap at either end. */
export function orderPosition(
  collection: OrderCollection,
  selected: OrderIdentity | null,
) {
  const index =
    selected === null
      ? -1
      : collection.orders.findIndex((order) => sameOrder(order, selected));
  return {
    index,
    total: collection.orders.length,
    previous: index > 0 ? (collection.orders[index - 1] ?? null) : null,
    next: index >= 0 ? (collection.orders[index + 1] ?? null) : null,
  };
}
