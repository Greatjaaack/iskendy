import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRecord } from '../../storage/schemas';
import type {
  claimOrder,
  createFeedback,
  updateRating,
  sendFeedbackDetail,
  checkFeedback,
} from '../../api/endpoints/guest';
import type { ApiError } from '../../api/errors';
import { createRatingService } from './service';
const base: OrderRecord = {
  n: 997,
  d: '2026-10-07',
  subAt: 10,
  servedAt: 100,
  claim: 'synthetic-claim',
  lastStatus: 'served',
  unknownLegacyField: 'retain',
};
const saved = {
  ok: true as const,
  feedbackId: 1,
  editToken: 'synthetic-edit',
  rating: 5,
  number: 997,
  branch: 'positive' as const,
  waitSeconds: 0,
  links: {},
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let record: OrderRecord | null;
const deps = {
  read: () => record,
  write: vi.fn((value: OrderRecord) => {
    record = value;
  }),
  guest: () => 'synthetic-guest',
  check: vi.fn<typeof checkFeedback>(),
  claim: vi.fn<typeof claimOrder>(),
  create: vi.fn<typeof createFeedback>(),
  rate: vi.fn<typeof updateRating>(),
  detail: vi.fn<typeof sendFeedbackDetail>(),
};
beforeEach(() => {
  record = { ...base };
  deps.write.mockClear();
  deps.check.mockReset().mockResolvedValue({
    ok: true,
    data: { ok: true, reason: null, number: 997, waitSeconds: 0 },
  });
  deps.claim.mockReset().mockResolvedValue({
    ok: true,
    data: { ok: true, claimToken: 'synthetic-claim', number: 997 },
  });
  deps.create.mockReset().mockResolvedValue({ ok: true, data: saved });
  deps.rate.mockReset().mockResolvedValue({
    ok: true,
    data: { ok: true, branch: 'negative', links: {} },
  });
  deps.detail.mockReset().mockResolvedValue({ ok: true, data: { ok: true } });
});
describe('explicit rating actions and original storage contract', () => {
  it('stores server identities/branch and retains unknown legacy fields without unnecessary claim', async () => {
    expect((await createRatingService(deps).submit(5)).kind).toBe('saved');
    expect(record).toMatchObject({
      rated: true,
      unknownLegacyField: 'retain',
      fb: {
        id: 1,
        token: 'synthetic-edit',
        rating: 5,
        branch: 'positive',
        detailSent: false,
      },
    });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.create).toHaveBeenCalledWith(
      { number: 997, rating: 5, claim_token: 'synthetic-claim' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it('ensures one missing claim before creation', async () => {
    record = { ...base, claim: '' };
    await createRatingService(deps).submit(5);
    expect(deps.claim).toHaveBeenCalledOnce();
    expect(deps.claim).toHaveBeenCalledWith(
      { number: 997, guest: 'synthetic-guest' },
      expect.anything(),
    );
    expect(record?.claim).toBe('synthetic-claim');
  });
  it('changes emotion using rate and takes branch from server, never a client threshold', async () => {
    record = {
      ...base,
      rated: true,
      fb: { id: 1, token: 'synthetic-edit', rating: 5, branch: 'positive' },
    };
    await createRatingService(deps).submit(4);
    expect(record?.fb).toMatchObject({ rating: 4, branch: 'negative' });
    expect(deps.rate).toHaveBeenCalledWith(
      { feedback_id: 1, edit_token: 'synthetic-edit', rating: 4 },
      expect.anything(),
    );
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.check).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent actions and permits another after cancellation', async () => {
    const pending = deferred<Awaited<ReturnType<typeof createFeedback>>>();
    deps.create.mockReturnValueOnce(pending.promise);
    const service = createRatingService(deps),
      first = service.submit(5);
    await vi.waitFor(() => expect(deps.create).toHaveBeenCalledOnce());
    expect((await service.submit(5)).kind).toBe('busy');
    expect((await service.sendDetail([], '')).kind).toBe('busy');
    service.cancel();
    pending.resolve({ ok: true, data: saved });
    expect((await first).kind).toBe('stale');
    expect(record?.fb).toBeUndefined();
    expect((await service.submit(5)).kind).toBe('saved');
  });
  for (const change of [
    'forget',
    'day',
    'number',
    'rollback',
    'other-tab',
  ] as const)
    it(`ignores a late create after ${change}`, async () => {
      const pending = deferred<Awaited<ReturnType<typeof createFeedback>>>();
      deps.create.mockReturnValue(pending.promise);
      const task = createRatingService(deps).submit(5);
      await vi.waitFor(() => expect(deps.create).toHaveBeenCalledOnce());
      record =
        change === 'forget'
          ? null
          : {
              ...base,
              ...(change === 'day'
                ? { d: '2026-10-08' }
                : change === 'number'
                  ? { n: 998 }
                  : change === 'rollback'
                    ? { servedAt: 0, lastStatus: 'ready' }
                    : {
                        fb: {
                          id: 2,
                          token: 'newer',
                          rating: 1,
                          branch: 'negative' as const,
                        },
                      }),
            };
      pending.resolve({ ok: true, data: saved });
      expect((await task).kind).toBe('stale');
      expect(deps.write).not.toHaveBeenCalled();
    });
  for (const kind of ['network', 'timeout'] as const)
    it(`reconciles ${kind} via a fresh check and never repeats POST`, async () => {
      deps.create.mockResolvedValue({ ok: false, error: { kind } });
      deps.check
        .mockResolvedValueOnce({
          ok: true,
          data: { ok: true, reason: null, number: 997, waitSeconds: 0 },
        })
        .mockResolvedValueOnce({
          ok: true,
          data: { ok: false, reason: 'already', message: 'accepted' },
        });
      const outcome = await createRatingService(deps).submit(5);
      expect(outcome.kind).toBe('already');
      expect(record).toMatchObject({ rated: true, done: true });
      expect(record?.fb).toBeUndefined();
      expect(deps.create).toHaveBeenCalledOnce();
      expect(deps.check).toHaveBeenCalledTimes(2);
    });
  it('keeps unresolved network outcomes retryable only by another explicit action', async () => {
    deps.create.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'network' },
    });
    const service = createRatingService(deps);
    expect((await service.submit(5)).kind).toBe('api');
    expect(record?.rated).toBeUndefined();
    expect((await service.submit(5)).kind).toBe('saved');
    expect(deps.create).toHaveBeenCalledTimes(2);
    expect(deps.check).toHaveBeenCalledTimes(3);
  });
  for (const error of [
    { kind: 'rate_limited' },
    { kind: 'http', status: 500 },
    { kind: 'schema', issues: ['invalid'] },
    { kind: 'aborted' },
  ] satisfies ApiError[])
    it(`does not retry ${error.kind} POST`, async () => {
      deps.create.mockResolvedValue({ ok: false, error });
      expect((await createRatingService(deps).submit(5)).kind).toBe('api');
      expect(deps.create).toHaveBeenCalledOnce();
      expect(record?.rated).toBeUndefined();
      expect(deps.check).toHaveBeenCalledOnce();
    });
  for (const reason of [
    'not_claimed',
    'not_found',
    'not_served',
    'already',
  ] as const)
    it(`honours create business outcome ${reason} without repeating`, async () => {
      deps.create.mockResolvedValue({
        ok: true,
        data: { ok: false, reason, message: reason },
      });
      expect((await createRatingService(deps).submit(5)).kind).toBe(
        reason === 'already' ? 'already' : 'business',
      );
      expect(deps.create).toHaveBeenCalledOnce();
      expect(Boolean(record?.rated)).toBe(reason === 'already');
      if (reason === 'not_claimed') expect(record?.claim).toBe('');
    });
  for (const reason of [
    'wrong_token',
    'locked',
    'expired',
    'unknown_feedback',
  ] as const)
    it(`honours rate business outcome ${reason} and preserves the previous rating`, async () => {
      record = {
        ...base,
        rated: true,
        fb: { id: 1, token: 'synthetic-edit', rating: 5, branch: 'positive' },
      };
      deps.rate.mockResolvedValue({
        ok: true,
        data: { ok: false, reason, message: reason },
      });
      expect((await createRatingService(deps).submit(1)).kind).toBe('business');
      expect(record.fb?.rating).toBe(5);
      expect(deps.rate).toHaveBeenCalledOnce();
    });
  for (const phase of ['check', 'claim', 'detail'] as const)
    it(`does not consume a late ${phase} response after cancellation`, async () => {
      record =
        phase === 'detail'
          ? {
              ...base,
              fb: { id: 1, token: 'edit', rating: 1, branch: 'negative' },
            }
          : // The claim now precedes check (B2); isolate the late check on a claimed record.
            { ...base, claim: phase === 'check' ? base.claim : '' };
      const pending = deferred<unknown>();
      // Controlled transport deliberately ignores AbortSignal to exercise the owner's stale-response guard.
      if (phase === 'check')
        deps.check.mockReturnValue(
          pending.promise as ReturnType<typeof checkFeedback>,
        );
      else if (phase === 'claim')
        deps.claim.mockReturnValue(
          pending.promise as ReturnType<typeof claimOrder>,
        );
      else
        deps.detail.mockReturnValue(
          pending.promise as ReturnType<typeof sendFeedbackDetail>,
        );
      const service = createRatingService(deps),
        task =
          phase === 'detail' ? service.sendDetail([], '') : service.submit(5);
      await vi.waitFor(() => expect(deps[phase]).toHaveBeenCalledOnce());
      service.cancel();
      pending.resolve({
        ok: true,
        data: {
          ok: true,
          number: 997,
          reason: null,
          waitSeconds: 0,
          claimToken: 'late',
        },
      });
      expect((await task).kind).toBe('stale');
      expect(deps.write).not.toHaveBeenCalled();
      expect(deps.create).not.toHaveBeenCalled();
    });
  it('does not submit when absent, not served, locked or invalid', async () => {
    const service = createRatingService(deps);
    record = null;
    expect((await service.submit(5)).kind).toBe('invalid');
    record = { ...base, servedAt: 0 };
    expect((await service.submit(5)).kind).toBe('business');
    record = {
      ...base,
      fb: {
        id: 1,
        token: 'edit',
        rating: 1,
        branch: 'negative',
        detailSent: true,
      },
    };
    expect((await service.submit(5)).kind).toBe('business');
    expect((await service.submit(6 as 5)).kind).toBe('invalid');
    expect(deps.create).not.toHaveBeenCalled();
  });
  it('honours fresh check rejection without claiming or posting', async () => {
    const service = createRatingService(deps);
    deps.check.mockResolvedValueOnce({ ok: false, error: { kind: 'network' } });
    expect((await service.submit(5)).kind).toBe('api');
    deps.check.mockResolvedValueOnce({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    expect((await service.submit(5)).kind).toBe('business');
    deps.check.mockResolvedValueOnce({
      ok: true,
      data: { ok: false, reason: 'already' },
    });
    expect((await service.submit(5)).kind).toBe('already');
    expect(deps.create).not.toHaveBeenCalled();
  });
  it('rejects mismatched check, claim and feedback identities', async () => {
    const service = createRatingService(deps);
    deps.check.mockResolvedValueOnce({
      ok: true,
      data: { ok: true, reason: null, number: 998, waitSeconds: 0 },
    });
    expect((await service.submit(5)).kind).toBe('api');
    record = { ...base, claim: '' };
    deps.claim.mockResolvedValueOnce({
      ok: true,
      data: { ok: true, number: 998, claimToken: 'wrong-number' },
    });
    expect((await service.submit(5)).kind).toBe('api');
    record = { ...base };
    deps.create.mockResolvedValueOnce({
      ok: true,
      data: { ...saved, number: 998 },
    });
    expect((await service.submit(5)).kind).toBe('api');
    expect(record.fb).toBeUndefined();
  });
  it('claims before the throttled check, so a taken number fails at once (B2)', async () => {
    record = { ...base, claim: '' };
    deps.claim.mockResolvedValueOnce({
      ok: true,
      data: { ok: false, reason: 'taken', message: 'server message' },
    });
    expect(await createRatingService(deps).submit(5)).toEqual({
      kind: 'business',
      reason: 'taken',
      message: 'server message',
    });
    expect(deps.check).not.toHaveBeenCalled();
    expect(deps.create).not.toHaveBeenCalled();
  });
  it('reuses a positive check from the last 20 s for the first rating only (B8)', async () => {
    const eligible = vi.fn(() => true);
    const service = createRatingService({ ...deps, eligible });
    expect((await service.submit(5)).kind).toBe('saved');
    expect(deps.check).not.toHaveBeenCalled();
    expect(deps.create).toHaveBeenCalledOnce();
  });
  it('still checks fresh after a lost create even if recently eligible (B8)', async () => {
    const service = createRatingService({ ...deps, eligible: () => true });
    deps.create.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'network' },
    });
    expect((await service.submit(5)).kind).toBe('api');
    expect(deps.check).toHaveBeenCalledOnce();
    expect((await service.submit(5)).kind).toBe('saved');
    expect(deps.check).toHaveBeenCalledTimes(2);
  });
  it('does not create after a failed or rejected missing-claim attempt', async () => {
    const service = createRatingService(deps);
    record = { ...base, claim: '' };
    deps.claim.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'rate_limited' },
    });
    expect((await service.submit(5)).kind).toBe('api');
    deps.claim.mockResolvedValueOnce({
      ok: true,
      data: { ok: false, reason: 'taken' },
    });
    expect((await service.submit(5)).kind).toBe('business');
    expect(deps.create).not.toHaveBeenCalled();
  });
});
describe('feedback detail acknowledgements', () => {
  for (const branch of ['negative', 'positive'] as const)
    it(`sends only allowed ${branch} fields and marks detailSent only after success`, async () => {
      record = { ...base, fb: { id: 1, token: 'edit', rating: 1, branch } };
      expect(
        (await createRatingService(deps).sendDetail(['Вкус'], 'private')).kind,
      ).toBe('saved');
      expect(deps.detail).toHaveBeenCalledWith(
        {
          feedback_id: 1,
          edit_token: 'edit',
          tags: ['Вкус'],
          ...(branch === 'negative' ? { comment: 'private', contact: '' } : {}),
        },
        expect.anything(),
      );
      expect(record).toMatchObject({ done: true, fb: { detailSent: true } });
    });
  for (const reason of ['unknown_feedback', 'wrong_token', 'expired'] as const)
    it(`does not mark detail saved for ${reason}`, async () => {
      record = {
        ...base,
        fb: { id: 1, token: 'edit', rating: 1, branch: 'negative' },
      };
      deps.detail.mockResolvedValue({ ok: true, data: { ok: false, reason } });
      expect(
        (await createRatingService(deps).sendDetail([], 'private')).kind,
      ).toBe('business');
      expect(record.fb?.detailSent).toBeUndefined();
      expect(record.done).toBeUndefined();
    });
  it('keeps detail drafts retryable after network failure without automatic retry', async () => {
    record = {
      ...base,
      fb: { id: 1, token: 'edit', rating: 1, branch: 'negative' },
    };
    deps.detail.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'network' },
    });
    const service = createRatingService(deps);
    expect((await service.sendDetail([], 'private')).kind).toBe('api');
    expect(deps.detail).toHaveBeenCalledOnce();
    expect(record.done).toBeUndefined();
    expect((await service.sendDetail([], 'private')).kind).toBe('saved');
    expect(deps.detail).toHaveBeenCalledTimes(2);
  });
  it('rejects a tag the backend would split on its comma, even with editable feedback', async () => {
    // backend main.feedback_detail joins tags with ',' and /stats splits them back.
    record = {
      ...base,
      fb: { id: 1, token: 'edit', rating: 1, branch: 'negative' },
    };
    const service = createRatingService(deps);
    for (const tags of [['Вкус, цена'], ['a'.repeat(41)], Array(13).fill('t')])
      expect((await service.sendDetail(tags, '')).kind).toBe('invalid');
    expect(deps.detail).not.toHaveBeenCalled();
  });
  it('rejects invalid bounds, missing feedback and previously sent detail', async () => {
    const service = createRatingService(deps);
    expect((await service.sendDetail([], '')).kind).toBe('invalid');
    for (const [tags, comment] of [
      [Array(13).fill('tag'), ''],
      [['a,b'], ''],
      [['a'.repeat(41)], ''],
      [Array(10).fill('a'.repeat(40)), ''],
      [[], 'a'.repeat(1001)],
    ] as [string[], string][])
      expect((await service.sendDetail(tags, comment)).kind).toBe('invalid');
    record = {
      ...base,
      fb: {
        id: 1,
        token: 'edit',
        rating: 1,
        branch: 'negative',
        detailSent: true,
      },
    };
    expect((await service.sendDetail([], '')).kind).toBe('business');
    expect(deps.detail).not.toHaveBeenCalled();
  });
});

describe('durable multiorder rating writes', () => {
  it('does not report a saved create when the storage write fails; retries only after a fresh check', async () => {
    const service = createRatingService({ ...deps, write: () => false });
    expect((await service.submit(5)).kind).toBe('storage');
    expect(record?.fb).toBeUndefined();
    deps.check.mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'already' },
    });
    expect((await service.submit(5)).kind).toBe('storage');
    expect(deps.create).toHaveBeenCalledOnce();
    expect(deps.check).toHaveBeenCalledTimes(2);
  });
  it('does not send a rating POST when a recovered claim cannot be stored', async () => {
    record = { ...base, claim: '' };
    const service = createRatingService({ ...deps, write: () => false });
    expect((await service.submit(5)).kind).toBe('storage');
    expect(deps.create).not.toHaveBeenCalled();
  });
  it('does not report detail saved when the storage acknowledgement fails', async () => {
    record = {
      ...base,
      fb: { id: 1, token: 'synthetic-edit', rating: 1, branch: 'negative' },
    };
    const service = createRatingService({ ...deps, write: () => false });
    expect((await service.sendDetail([], '')).kind).toBe('storage');
    expect(record?.done).toBeUndefined();
  });
});
