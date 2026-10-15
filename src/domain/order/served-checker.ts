import type { Board, FeedbackCheck } from '../../api/schemas/guest';
import type { ApiResult } from '../../api/errors';
import type { OrderRecord } from '../../storage/schemas';
import { advanceOrder, applyServedCheck, shouldCheckServed } from './machine';
type Snapshot = { record: OrderRecord | null; board: Board | null };
type Dependencies = {
  read: () => Snapshot;
  write: (record: OrderRecord) => void;
  check: (
    number: number,
    signal: AbortSignal,
  ) => Promise<ApiResult<FeedbackCheck>>;
};
const identity = (record: OrderRecord) =>
  [record.d, record.n, record.subAt ?? 0].join(':');
/** One app owner, no timers, no claims. Caller invokes tick from UI clock updates. */
export function createServedChecker({ read, write, check }: Dependencies) {
  let key = '',
    lastCheckAt: number | null = null;
  let request: { controller: AbortController; key: string } | null = null;
  return {
    async tick(now: number): Promise<boolean> {
      const snapshot = read(),
        record = snapshot.record;
      const nextKey = record ? identity(record) : '';
      if (key !== nextKey) {
        request?.controller.abort();
        request = null;
        key = nextKey;
        lastCheckAt = null;
      }
      const state = advanceOrder(record, snapshot.board, now).state;
      if (!record || state !== 'checking') {
        request?.controller.abort();
        request = null;
        return false;
      }
      if (!shouldCheckServed(lastCheckAt, now, Boolean(request))) return false;
      lastCheckAt = now;
      const current = { controller: new AbortController(), key: nextKey };
      request = current;
      try {
        const result = await check(record.n, current.controller.signal);
        if (
          !result.ok ||
          current.controller.signal.aborted ||
          request !== current
        )
          return true;
        const latest = read(),
          latestRecord = latest.record;
        if (
          !latestRecord ||
          identity(latestRecord) !== current.key ||
          advanceOrder(latestRecord, latest.board, now).state !== 'checking'
        )
          return true;
        const updated = applyServedCheck(latestRecord, result.data, now);
        if (JSON.stringify(updated) !== JSON.stringify(latestRecord))
          write(updated);
      } finally {
        if (request === current) request = null;
      }
      return true;
    },
    cancel() {
      request?.controller.abort();
      request = null;
    },
  };
}
