import type { Board, FeedbackCheck } from '../../api/schemas/guest';
import type { OrderRecord } from '../../storage/schemas';

export type OrderState =
  | 'none'
  | 'pending'
  | 'notFound'
  | 'preparing'
  | 'ready'
  | 'checking'
  | 'issued'
  | 'rated';
export type OrderEffect = 'forget' | 'ready' | 'prompt-rating' | 'check-served';
export function advanceOrder(
  record: OrderRecord | null,
  board: Board | null,
  now: number,
  promptDelaySec = 180,
): { record: OrderRecord | null; state: OrderState; effects: OrderEffect[] } {
  if (!record) return { record: null, state: 'none', effects: [] };
  if (board && record.d !== board.date)
    return { record: null, state: 'none', effects: ['forget'] };
  if (record.rated || record.done || record.fb?.id)
    return { record, state: 'rated', effects: [] };
  const active = board?.orders.find((order) => order.number === record.n);
  if (active) {
    const state = active.status === 'ready' ? 'ready' : 'preparing';
    const reset = Boolean(record.servedAt);
    // An initial ready snapshot is not a preparing -> ready transition (legacy myWatch).
    const ready =
      state === 'ready' &&
      (Boolean(record.lastStatus) || reset) &&
      (record.lastStatus !== 'ready' || reset);
    return {
      record: {
        ...record,
        seen: true,
        gone: false,
        ...(reset ? { servedAt: 0, promptedAt: 0 } : {}),
        lastStatus: state,
      },
      state,
      effects: ready ? ['ready'] : [],
    };
  }
  if (record.gone) return { record, state: 'notFound', effects: [] };
  if (record.servedAt) {
    const prompt =
      !record.promptedAt && now - record.servedAt >= promptDelaySec * 1000;
    return {
      record: prompt ? { ...record, promptedAt: now } : record,
      state: 'issued',
      effects: prompt ? ['prompt-rating'] : [],
    };
  }
  if (!board)
    return {
      record,
      state:
        record.lastStatus === 'ready'
          ? 'ready'
          : record.seen
            ? 'preparing'
            : 'pending',
      effects: [],
    };
  if (!record.seen) {
    const limit = board.servedCount === 0 ? 240_000 : 60_000;
    return {
      record,
      state: now - (record.subAt ?? now) >= limit ? 'notFound' : 'pending',
      effects: [],
    };
  }
  return { record, state: 'checking', effects: ['check-served'] };
}
export function applyServedCheck(
  record: OrderRecord,
  response: FeedbackCheck,
  now: number,
): OrderRecord {
  if (response.ok && response.number !== record.n) return record;
  if (response.ok)
    return { ...record, servedAt: now, gone: false, lastStatus: 'served' };
  if (response.reason === 'already') return { ...record, rated: true };
  if (response.reason === 'not_found') return { ...record, gone: true };
  return record;
}
export function shouldCheckServed(
  lastCheckAt: number | null,
  now: number,
  inFlight: boolean,
): boolean {
  return !inFlight && (lastCheckAt === null || now - lastCheckAt >= 20_000);
}
