import type { Board, FeedbackCheck } from '../../api/schemas/guest';
import type { ApiResult } from '../../api/errors';
import type { OrderRecord } from '../../storage/schemas';
import type { OrderIdentity } from '../orderCollection';
import { advanceOrder } from './machine';
import { createServedChecker } from './served-checker';
type Dependencies = {
  readOrders: () => OrderRecord[];
  readBoard: () => Board | null;
  patch: (identity: OrderIdentity, changes: Partial<OrderRecord>) => boolean;
  check: (
    number: number,
    signal: AbortSignal,
  ) => Promise<ApiResult<FeedbackCheck>>;
  onReady: (number: number) => void;
  onRatingPrompt: (number: number) => void;
  promptDelaySec: () => number;
};
/** One collection owner. Shared board cache; at most one feedback check in flight.
 * Each check keeps the existing 20s per-order limit. No claim requests or selection writes.
 * Yesterday's claims stay in storage for rollback; never check them against today's API.
 */
export function createCollectionOwner(deps: Dependencies) {
  const checkers = new Map<string, ReturnType<typeof createServedChecker>>();
  let checking = false,
    epoch = 0;
  const keyOf = (r: OrderRecord) => [r.d, r.n, r.subAt ?? 0].join(':');
  return {
    tick(now: number) {
      const board = deps.readBoard();
      const records = deps
        .readOrders()
        .filter((r) => !board || r.d === board.date);
      const keys = new Set(records.map(keyOf));
      for (const [key, checker] of checkers)
        if (!keys.has(key)) {
          checker.cancel();
          checkers.delete(key);
        }
      for (const record of records) {
        const transition = advanceOrder(
          record,
          board,
          now,
          deps.promptDelaySec(),
        );
        if (!transition.record) continue;
        const changes = Object.fromEntries(
          Object.entries(transition.record).filter(
            ([key, value]) =>
              JSON.stringify(value) !== JSON.stringify(record[key]),
          ),
        );
        if (Object.keys(changes).length && !deps.patch(record, changes))
          continue;
        if (transition.effects.includes('ready')) deps.onReady(record.n);
        if (transition.effects.includes('prompt-rating'))
          deps.onRatingPrompt(record.n);
      }
      if (checking) return;
      checking = true;
      const attemptEpoch = epoch;
      void (async () => {
        for (const record of records) {
          if (advanceOrder(record, board, now).state !== 'checking') continue;
          const key = keyOf(record);
          let checker = checkers.get(key);
          if (!checker) {
            checker = createServedChecker({
              read: () => ({
                record: deps.readOrders().find((r) => keyOf(r) === key) ?? null,
                board: deps.readBoard(),
              }),
              write: (next) => {
                const current = deps.readOrders().find((r) => keyOf(r) === key);
                if (current)
                  deps.patch(
                    current,
                    Object.fromEntries(
                      Object.entries(next).filter(
                        ([field, value]) =>
                          JSON.stringify(value) !==
                          JSON.stringify(current[field]),
                      ),
                    ),
                  );
              },
              check: deps.check,
            });
            checkers.set(key, checker);
          }
          // Skip candidates inside their 20s limit; stop after one actual request.
          if (await checker.tick(now)) break;
          if (attemptEpoch !== epoch) break;
        }
      })()
        .catch(() => {})
        .finally(() => {
          if (attemptEpoch === epoch) checking = false;
        });
    },
    cancel() {
      epoch++;
      checking = false;
      for (const checker of checkers.values()) checker.cancel();
      checkers.clear();
    },
  };
}
