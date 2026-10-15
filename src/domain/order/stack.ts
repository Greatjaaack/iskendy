import type { OrderRecord } from '../../storage/schemas';
import { sameOrder, type OrderIdentity } from '../orderCollection';
import type { OrderState } from './machine';

/** Web/OrderStrip 664:23494: status = word + icon + colour. */
export type StripStatus =
  'preparing' | 'ready' | 'waiting' | 'notfound' | 'issued' | 'rated';
export function stripStatus(
  state: OrderState,
  record: OrderRecord,
): StripStatus {
  if (state === 'pending') return 'waiting';
  if (state === 'notFound') return 'notfound';
  if (state === 'issued' || state === 'rated') return state;
  if (
    state === 'ready' ||
    (state === 'checking' && record.lastStatus === 'ready')
  )
    return 'ready';
  return 'preparing';
}
// Most urgent first: the open card defaults to what the guest must act on now.
const urgency: Record<StripStatus, number> = {
  ready: 0,
  preparing: 1,
  waiting: 2,
  notfound: 3,
  issued: 4,
  rated: 5,
};
export type Strip = { record: OrderRecord; status: StripStatus };
/** Variant A (owner, 12.10): one open card, active strips in insertion order,
 * issued and rated orders folded into «Завершённые сегодня». */
export function arrangeStack(
  records: OrderRecord[],
  stateOf: (record: OrderRecord) => OrderState,
  selected: OrderIdentity | null,
): { open: OrderRecord | null; active: Strip[]; completed: Strip[] } {
  const strips = records.map((record) => ({
    record,
    status: stripStatus(stateOf(record), record),
  }));
  const chosen = selected
    ? strips.find((strip) => sameOrder(strip.record, selected))
    : undefined;
  const open =
    chosen ??
    strips.reduce<Strip | undefined>(
      (best, strip) =>
        !best || urgency[strip.status] < urgency[best.status] ? strip : best,
      undefined,
    );
  const rest = strips.filter((strip) => strip !== open);
  const done = (strip: Strip) =>
    strip.status === 'issued' || strip.status === 'rated';
  return {
    open: open?.record ?? null,
    active: rest.filter((strip) => !done(strip)),
    completed: rest.filter(done),
  };
}
