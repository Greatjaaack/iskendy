import type {
  claimOrder,
  createFeedback,
  updateRating,
  sendFeedbackDetail,
  checkFeedback,
} from '../../api/endpoints/guest';
import type { ApiError } from '../../api/errors';
import type { OrderRecord } from '../../storage/schemas';
import type { Emotion } from '../../content/emotion';
import type { Feedback } from '../../api/schemas/guest';

type Dependencies = {
  read: () => OrderRecord | null;
  write: (record: OrderRecord) => void | boolean;
  guest: () => string;
  claim: typeof claimOrder;
  create: typeof createFeedback;
  rate: typeof updateRating;
  detail: typeof sendFeedbackDetail;
  check: typeof checkFeedback;
  /** B8: a positive check from the last 20 s (e.g. the subscription) stands in for a new one. */
  eligible?: (number: number) => boolean;
};
export type RatingOutcome =
  | { kind: 'saved' | 'already'; record: OrderRecord; message?: string }
  | { kind: 'business'; reason: string; message?: string }
  | { kind: 'api'; error: ApiError }
  | { kind: 'busy' | 'stale' | 'invalid' | 'storage' };
const identity = (record: OrderRecord) =>
  [record.d, record.n, record.subAt ?? 0].join(':');
const version = (record: OrderRecord) =>
  JSON.stringify([
    identity(record),
    record.rated,
    record.done,
    record.fb,
    record.servedAt,
    record.gone,
    record.lastStatus,
  ]);
/** Explicit actions only. No automatic POST retries, tokens never leave their original storage fields. */
export function createRatingService(dependencies: Dependencies) {
  let active: { controller: AbortController; version: string } | null = null;
  const uncertain = new Set<string>();
  const run = async (
    action: (
      record: OrderRecord,
      signal: AbortSignal,
      current: () => OrderRecord | null,
    ) => Promise<RatingOutcome>,
  ): Promise<RatingOutcome> => {
    if (active) return { kind: 'busy' };
    const initial = dependencies.read();
    if (!initial) return { kind: 'invalid' };
    const request = {
      controller: new AbortController(),
      version: version(initial),
    };
    active = request;
    const current = () => {
      const latest = dependencies.read();
      return active === request &&
        !request.controller.signal.aborted &&
        latest &&
        version(latest) === request.version
        ? latest
        : null;
    };
    try {
      return await action(initial, request.controller.signal, current);
    } finally {
      if (active === request) active = null;
    }
  };
  return {
    submit(emotion: Emotion): Promise<RatingOutcome> {
      if (!Number.isInteger(emotion) || emotion < 1 || emotion > 5)
        return Promise.resolve({ kind: 'invalid' });
      return run(async (record, signal, current) => {
        if (record.fb?.detailSent)
          return { kind: 'business', reason: 'locked' };
        if (!record.fb && !record.servedAt)
          return { kind: 'business', reason: 'not_served' };
        // B2: claim before the 20 s check gate, so «taken» is shown at once, not after the wait.
        let claim = record.claim ?? '';
        if (!record.fb && !claim) {
          const response = await dependencies.claim(
            { number: record.n, guest: dependencies.guest() },
            { signal },
          );
          if (!current()) return { kind: 'stale' };
          if (!response.ok) return { kind: 'api', error: response.error };
          if (!response.data.ok)
            return {
              kind: 'business',
              reason: response.data.reason,
              message: response.data.message,
            };
          if (response.data.number !== record.n)
            return {
              kind: 'api',
              error: { kind: 'schema', issues: ['claim identity mismatch'] },
            };
          claim = response.data.claimToken;
          if (dependencies.write({ ...current()!, claim }) === false)
            return { kind: 'storage' };
        }
        const key = identity(record);
        // A cancelled/lost create can have committed. Fresh check is required before another POST.
        const fresh =
          !record.fb &&
          !uncertain.has(key) &&
          dependencies.eligible?.(record.n) === true;
        if ((!record.fb || uncertain.has(key)) && !fresh) {
          const check = await dependencies.check(record.n, { signal });
          if (!current()) return { kind: 'stale' };
          if (!check.ok) return { kind: 'api', error: check.error };
          if (!check.data.ok) {
            if (check.data.reason === 'already') {
              const next = { ...current()!, rated: true, done: true };
              if (dependencies.write(next) === false)
                return { kind: 'storage' };
              uncertain.delete(key);
              return {
                kind: 'already',
                record: next,
                message: check.data.message,
              };
            }
            return {
              kind: 'business',
              reason: check.data.reason,
              message: check.data.message,
            };
          }
          if (check.data.number !== record.n)
            return {
              kind: 'api',
              error: { kind: 'schema', issues: ['check identity mismatch'] },
            };
          uncertain.delete(key);
        }
        if (!current()) return { kind: 'stale' };
        if (!record.fb) uncertain.add(key);
        const response = record.fb
          ? await dependencies.rate(
              {
                feedback_id: record.fb.id,
                edit_token: record.fb.token,
                rating: emotion,
              },
              { signal },
            )
          : await dependencies.create(
              { number: record.n, rating: emotion, claim_token: claim },
              { signal },
            );
        if (!current()) return { kind: 'stale' };
        if (!response.ok) {
          if (
            !record.fb &&
            (response.error.kind === 'network' ||
              response.error.kind === 'timeout')
          ) {
            const check = await dependencies.check(record.n, { signal });
            if (!current()) return { kind: 'stale' };
            if (check.ok && !check.data.ok && check.data.reason === 'already') {
              const next = { ...current()!, rated: true, done: true };
              if (dependencies.write(next) === false)
                return { kind: 'storage' };
              uncertain.delete(key);
              return {
                kind: 'already',
                record: next,
                message: check.data.message,
              };
            }
          } else if (!record.fb) uncertain.delete(key);
          return { kind: 'api', error: response.error };
        }
        uncertain.delete(key);
        const data = response.data;
        if (!data.ok) {
          if (data.reason === 'already') {
            const next = { ...current()!, rated: true, done: true };
            if (dependencies.write(next) === false) return { kind: 'storage' };
            return { kind: 'already', record: next, message: data.message };
          }
          if (
            data.reason === 'not_claimed' &&
            dependencies.write({ ...current()!, claim: '' }) === false
          )
            return { kind: 'storage' };
          return {
            kind: 'business',
            reason: data.reason,
            message: data.message,
          };
        }
        if (
          'number' in data &&
          (data.number !== record.n || data.rating !== emotion)
        )
          return {
            kind: 'api',
            error: { kind: 'schema', issues: ['feedback identity mismatch'] },
          };
        const created = !record.fb
          ? (data as Extract<Feedback, { ok: true }>)
          : null;
        const fb = created
          ? {
              id: created.feedbackId,
              token: created.editToken,
              rating: created.rating,
              branch: created.branch,
              detailSent: false,
            }
          : { ...record.fb!, rating: emotion, branch: data.branch };
        const next = { ...current()!, rated: true, fb };
        if (dependencies.write(next) === false) {
          if (!record.fb) uncertain.add(key);
          return { kind: 'storage' };
        }
        return { kind: 'saved', record: next };
      });
    },
    sendDetail(tags: string[], comment: string): Promise<RatingOutcome> {
      if (
        tags.length > 12 ||
        tags.some((tag) => tag.length > 40 || tag.includes(',')) ||
        tags.join(',').length > 300 ||
        comment.length > 1000
      )
        return Promise.resolve({ kind: 'invalid' });
      return run(async (record, signal, current) => {
        if (!record.fb) return { kind: 'invalid' };
        if (record.fb.detailSent) return { kind: 'business', reason: 'locked' };
        const response = await dependencies.detail(
          {
            feedback_id: record.fb.id,
            edit_token: record.fb.token,
            tags: [...tags],
            ...(record.fb.branch === 'negative'
              ? { comment, contact: '' }
              : {}),
          },
          { signal },
        );
        if (!current()) return { kind: 'stale' };
        if (!response.ok) return { kind: 'api', error: response.error };
        if (!response.data.ok)
          return {
            kind: 'business',
            reason: response.data.reason,
            message: response.data.message,
          };
        const next = {
          ...current()!,
          done: true,
          fb: { ...record.fb, detailSent: true },
        };
        if (dependencies.write(next) === false) return { kind: 'storage' };
        return { kind: 'saved', record: next };
      });
    },
    cancel(): void {
      active?.controller.abort();
      active = null;
    },
  };
}
