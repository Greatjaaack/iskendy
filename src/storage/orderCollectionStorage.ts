import * as z from 'zod/mini';
import {
  addOrder,
  emptyOrders,
  migrateOrders,
  patchCollectionOrder,
  removeOrder,
  type OrderCollection,
  type OrderIdentity,
} from '../domain/orderCollection';
import { STORAGE_KEYS } from './keys';
import { orderRecordSchema, type OrderRecord } from './schemas';

/** Additive journal: never replaces or deletes the legacy single-order key.
 * Each write gets its own key, so concurrent additions/patches in two tabs survive.
 * Selection remains outside the journal and cannot be changed by another tab.
 * ADR-019: above 20 keys the journal folds into one snapshot that lists the keys it
 * absorbed; a write another tab makes meanwhile is not in that list and survives, and
 * absorbed keys left by an interrupted deletion are never replayed. Keys are never
 * rewritten, so the key set alone tells whether the parsed journal is still current.
 */
export const ORDER_JOURNAL_PREFIX = 'iskendy_orders_v1:';
type Local = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'> &
  Partial<Pick<Storage, 'removeItem'>>;
const COMPACT_ABOVE = 20;
const identitySchema = z.object({
  n: orderRecordSchema.shape.n,
  d: orderRecordSchema.shape.d,
});
const operationSchema = z.discriminatedUnion('kind', [
  z.object({
    sequence: z.int().check(z.positive()),
    kind: z.literal('add'),
    record: orderRecordSchema,
  }),
  z.object({
    sequence: z.int().check(z.positive()),
    kind: z.literal('patch'),
    identity: identitySchema,
    patch: z.partial(orderRecordSchema),
  }),
  z.object({
    sequence: z.int().check(z.positive()),
    kind: z.literal('remove'),
    identity: identitySchema,
  }),
  z.object({
    sequence: z.int().check(z.nonnegative()),
    kind: z.literal('snapshot'),
    orders: z.array(orderRecordSchema),
    absorbed: z.array(z.string()),
  }),
]);
type Operation = z.infer<typeof operationSchema>;
type Failure = {
  ok: false;
  reason: 'invalid-legacy' | 'invalid-collection' | 'storage-unavailable';
};
type Result = { ok: true; collection: OrderCollection } | Failure;

export function createOrderCollectionStorage(
  options: { local?: () => Local; id?: () => string } = {},
) {
  const local = options.local ?? (() => window.localStorage);
  const id =
    options.id ??
    (() =>
      Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) =>
        part.toString(16).padStart(8, '0'),
      ).join(''));
  type Read = { result: Result; operations: Operation[]; keys: string[] };
  let cache: { fingerprint: string; value: Read } | null = null;
  function snapshot(): Read {
    try {
      const storage = local();
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(ORDER_JOURNAL_PREFIX)) keys.push(key);
      }
      keys.sort();
      const fingerprint = keys.join('\n');
      if (keys.length && cache?.fingerprint === fingerprint) return cache.value;
      const entries: { key: string; operation: Operation }[] = [];
      for (const key of keys) {
        const bytes = storage.getItem(key);
        // A disappeared key or malformed event is not an empty collection.
        let value: unknown;
        try {
          value = JSON.parse(bytes ?? 'null');
        } catch {
          return {
            result: { ok: false, reason: 'invalid-collection' },
            operations: [],
            keys,
          };
        }
        const parsed = operationSchema.safeParse(value);
        if (!parsed.success)
          return {
            result: { ok: false, reason: 'invalid-collection' },
            operations: [],
            keys,
          };
        entries.push({ key, operation: parsed.data });
      }
      const order = (
        a: { key: string; operation: Operation },
        b: { key: string; operation: Operation },
      ) =>
        a.operation.sequence - b.operation.sequence ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      entries.sort(order);
      if (entries.length === 0) {
        const migrated = migrateOrders(
          storage.getItem(STORAGE_KEYS.order),
          null,
        );
        return { result: migrated, operations: [], keys };
      }
      const snapshots = entries.filter(
        (entry) => entry.operation.kind === 'snapshot',
      );
      const base = snapshots.at(-1)?.operation;
      const absorbed = new Set(
        snapshots.flatMap(({ operation }) =>
          operation.kind === 'snapshot' ? operation.absorbed : [],
        ),
      );
      let collection: OrderCollection =
        base?.kind === 'snapshot'
          ? { version: 1, orders: base.orders }
          : emptyOrders();
      for (const { key, operation } of entries) {
        if (operation.kind === 'snapshot' || absorbed.has(key)) continue;
        collection =
          operation.kind === 'add'
            ? addOrder(collection, operation.record)
            : operation.kind === 'remove'
              ? removeOrder(collection, operation.identity)
              : patchCollectionOrder(
                  collection,
                  operation.identity,
                  operation.patch,
                );
      }
      const value: Read = {
        result: { ok: true, collection },
        operations: entries.map(({ operation }) => operation),
        keys,
      };
      cache = { fingerprint, value };
      return value;
    } catch {
      return {
        result: { ok: false, reason: 'storage-unavailable' },
        operations: [],
        keys: [],
      };
    }
  }
  /** Fold the journal into one snapshot; keep only orders that pass `keep`. */
  function compact(keep: (order: OrderRecord) => boolean = () => true): Result {
    const current = snapshot();
    if (!current.result.ok || current.operations.length === 0)
      return current.result;
    const sequence = current.operations.reduce(
      (max, operation) => Math.max(max, operation.sequence),
      0,
    );
    try {
      const storage = local();
      const key = ORDER_JOURNAL_PREFIX + id();
      if (storage.getItem(key) !== null) return current.result;
      // Write the snapshot first: if the tab dies before the deletions, nothing is lost.
      storage.setItem(
        key,
        JSON.stringify(
          operationSchema.parse({
            sequence,
            kind: 'snapshot',
            orders: current.result.collection.orders.filter(keep),
            absorbed: current.keys,
          }),
        ),
      );
      for (const absorbed of current.keys) storage.removeItem?.(absorbed);
    } catch {
      /* Absorbed keys left behind are skipped on replay. */
    }
    return snapshot().result;
  }
  const settle = (result: Result): Result => {
    if (result.ok && snapshot().keys.length > COMPACT_ABOVE) return compact();
    return result;
  };
  function append(operation: Operation): boolean {
    try {
      const storage = local();
      const key = ORDER_JOURNAL_PREFIX + id();
      // A collision is an explicit failure, never an overwrite of another operation.
      if (storage.getItem(key) !== null) return false;
      storage.setItem(key, JSON.stringify(operationSchema.parse(operation)));
      return true;
    } catch {
      return false;
    }
  }
  function prepare(): { result: Result; sequence: number } {
    const current = snapshot();
    if (!current.result.ok) return { result: current.result, sequence: 0 };
    let sequence = current.operations.reduce(
      (max, operation) => Math.max(max, operation.sequence),
      0,
    );
    if (current.operations.length === 0) {
      for (const record of current.result.collection.orders) {
        if (!append({ kind: 'add', record, sequence: ++sequence }))
          return {
            result: { ok: false, reason: 'storage-unavailable' },
            sequence,
          };
      }
    }
    return { result: current.result, sequence };
  }
  return {
    read: (): Result => snapshot().result,
    migrate: (): Result => prepare().result,
    compact: (): Result => compact(),
    /** ADR-019: one business day, by the board date (not the phone clock). */
    keepDay(date: string): Result {
      const current = prepare();
      if (!current.result.ok) return current.result;
      if (current.result.collection.orders.every((order) => order.d === date))
        return settle(current.result);
      return compact((order) => order.d === date);
    },
    add(record: OrderRecord): Result {
      // Validate before migration writes anything.
      const parsed = orderRecordSchema.safeParse(record);
      if (!parsed.success) return { ok: false, reason: 'invalid-collection' };
      const current = prepare();
      if (!current.result.ok) return current.result;
      if (
        addOrder(current.result.collection, parsed.data) ===
        current.result.collection
      )
        return current.result;
      if (
        !append({
          kind: 'add',
          record: parsed.data,
          sequence: current.sequence + 1,
        })
      )
        return { ok: false, reason: 'storage-unavailable' };
      return settle(snapshot().result);
    },
    patch(identity: OrderIdentity, patch: Partial<OrderRecord>): Result {
      const parsedIdentity = identitySchema.safeParse(identity),
        parsedPatch = z.partial(orderRecordSchema).safeParse(patch);
      if (!parsedIdentity.success || !parsedPatch.success)
        return { ok: false, reason: 'invalid-collection' };
      const current = prepare();
      if (!current.result.ok) return current.result;
      if (
        patchCollectionOrder(
          current.result.collection,
          identity,
          parsedPatch.data,
        ) === current.result.collection
      )
        return current.result;
      if (
        !append({
          kind: 'patch',
          identity: parsedIdentity.data,
          patch: parsedPatch.data,
          sequence: current.sequence + 1,
        })
      )
        return { ok: false, reason: 'storage-unavailable' };
      return settle(snapshot().result);
    },
    remove(identity: OrderIdentity): Result {
      const parsedIdentity = identitySchema.safeParse(identity);
      if (!parsedIdentity.success)
        return { ok: false, reason: 'invalid-collection' };
      const current = prepare();
      if (!current.result.ok) return current.result;
      if (
        removeOrder(current.result.collection, parsedIdentity.data) ===
        current.result.collection
      )
        return current.result;
      if (
        !append({
          kind: 'remove',
          identity: parsedIdentity.data,
          sequence: current.sequence + 1,
        })
      )
        return { ok: false, reason: 'storage-unavailable' };
      return settle(snapshot().result);
    },
  };
}
