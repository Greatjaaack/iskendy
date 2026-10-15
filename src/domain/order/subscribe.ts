import type { ApiError, ApiResult } from '../../api/errors';
import type { Board, Claim, FeedbackCheck } from '../../api/schemas/guest';
import type { OrderRecord } from '../../storage/schemas';

type ClaimCall = (input: {
  number: number;
  guest: string;
}) => Promise<ApiResult<Claim>>;
type Dependencies = {
  check: (number: number) => Promise<ApiResult<FeedbackCheck>>;
  claim: ClaimCall;
};
export type SubscriptionResult =
  | { ok: true; record: OrderRecord; pending: boolean; alreadyServed: boolean }
  | {
      ok: false;
      reason: 'invalid' | 'busy' | 'unavailable' | 'api' | 'business';
      error?: ApiError;
      message?: string;
    };
export function parseOrderNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return number > 0 && number <= 999 ? number : null;
}
/** Called only by the explicit subscribe action; no background claim or retry loop. */
export function createSubscriptionService(dependencies: Dependencies) {
  let inFlight = false;
  return async (
    input: string,
    board: Board | null,
    guest: string,
    now: number,
  ): Promise<SubscriptionResult> => {
    if (inFlight) return { ok: false, reason: 'busy' };
    const n = parseOrderNumber(input);
    if (n === null) return { ok: false, reason: 'invalid' };
    if (!board) return { ok: false, reason: 'unavailable' }; // Never invent the restaurant's business date from device time.
    inFlight = true;
    try {
      let seen = board.orders.some((order) => order.number === n);
      if (!seen) {
        const result = await dependencies.check(n);
        if (!result.ok)
          return { ok: false, reason: 'api', error: result.error };
        if (result.data.ok || result.data.reason === 'already') {
          const rated = !result.data.ok;
          return {
            ok: true,
            pending: false,
            alreadyServed: true,
            record: {
              n,
              d: board.date,
              seen: true,
              servedAt: now,
              promptedAt: now,
              rated,
              done: rated,
              lastStatus: 'served',
            },
          };
        }
        seen = result.data.reason === 'not_served';
      }
      const result = await dependencies.claim({ number: n, guest });
      if (
        !result.ok &&
        result.error.kind !== 'network' &&
        result.error.kind !== 'timeout'
      )
        return { ok: false, reason: 'api', error: result.error };
      if (result.ok && !result.data.ok)
        return { ok: false, reason: 'business', message: result.data.message };
      const claim = result.ok && result.data.ok ? result.data.claimToken : '';
      return {
        ok: true,
        pending: !seen,
        alreadyServed: false,
        record: {
          n,
          d: board.date,
          seen,
          subAt: now,
          claim,
          servedAt: 0,
          rated: false,
          done: false,
          lastStatus: '',
        },
      };
    } finally {
      inFlight = false;
    }
  };
}
