import { describe, expect, it, vi } from 'vitest';
import { createRatingFlow } from './flow';
import type { RatingOutcome } from './service';
import type { OrderRecord } from '../../storage/schemas';

const record: OrderRecord = { n: 997, d: '2026-10-08', servedAt: 10 };
function setup(branch: 'positive' | 'negative' = 'negative', pick = true) {
  const saved: RatingOutcome = {
    kind: 'saved',
    record: {
      ...record,
      rated: true,
      fb: { id: 1, token: 'synthetic', rating: 3, branch },
    },
  };
  const service = {
    submit: vi.fn().mockResolvedValue(saved),
    sendDetail: vi.fn().mockResolvedValue(saved),
    cancel: vi.fn(),
  };
  const rated = vi.fn(),
    detailed = vi.fn(),
    finish = vi.fn();
  const flow = createRatingFlow({ service, record, rated, detailed, finish });
  // UX-16: no default emotion; most scenarios start from an explicit choice.
  if (pick) flow.change({ emotion: 3, tags: [], comment: '' });
  return {
    flow,
    service,
    rated,
    detailed,
    finish,
    saved,
  };
}
describe('rating flow driven by acknowledged API outcomes', () => {
  it('keeps negative reasons and private comment through back navigation, sends only on R3', async () => {
    const { flow, service, detailed } = setup();
    await flow.next();
    flow.change({ emotion: 3, tags: ['Остыло'], comment: 'private draft' });
    await flow.next();
    expect(flow.getSnapshot().step).toBe(3);
    expect(service.sendDetail).not.toHaveBeenCalled();
    expect(flow.back()).toBe(false);
    expect(flow.getSnapshot()).toMatchObject({
      step: 2,
      draft: { tags: ['Остыло'], comment: 'private draft' },
    });
    await flow.next();
    await flow.next();
    expect(service.sendDetail).toHaveBeenCalledWith(
      ['Остыло'],
      'private draft',
    );
    expect(flow.getSnapshot().step).toBe(4);
    expect(detailed).toHaveBeenCalledOnce();
  });
  it('positive feedback also offers a comment and files before acknowledged completion', async () => {
    const { flow, service } = setup('positive');
    await flow.next();
    flow.change({ emotion: 5, tags: ['Вкус'], comment: '' });
    await flow.next();
    expect(flow.getSnapshot().step).toBe(3);
    expect(service.sendDetail).not.toHaveBeenCalled();
    flow.change({ ...flow.getSnapshot().draft, comment: 'Спасибо' });
    await flow.next();
    expect(service.sendDetail).toHaveBeenCalledWith(['Вкус'], 'Спасибо');
    expect(flow.getSnapshot().step).toBe(4);
  });
  it.each(['next', 'skip'] as const)(
    'keeps the optional comment step without claiming detail success through %s',
    async (action) => {
      const { flow, service, finish, detailed } = setup('positive');
      await flow.next();
      await flow[action]();
      expect(flow.getSnapshot().step).toBe(3);
      expect(finish).not.toHaveBeenCalled();
      expect(service.sendDetail).not.toHaveBeenCalled();
      expect(detailed).not.toHaveBeenCalled();
    },
  );
  it('negative skip clears reasons but keeps the comment draft and goes to R3', async () => {
    const { flow, service } = setup();
    await flow.next();
    flow.change({ emotion: 3, tags: ['Остыло'], comment: 'draft' });
    await flow.skip();
    expect(flow.getSnapshot()).toMatchObject({
      step: 3,
      draft: { tags: [], comment: 'draft' },
    });
    expect(service.sendDetail).not.toHaveBeenCalled();
  });
  it('deduplicates Next and ignores pending replies after close while preserving draft', async () => {
    const { flow, service, rated } = setup();
    let resolve!: (value: RatingOutcome) => void;
    service.submit.mockReturnValue(
      new Promise<RatingOutcome>((done) => {
        resolve = done;
      }),
    );
    flow.change({ emotion: 1, tags: [], comment: 'draft' });
    const pending = flow.next();
    await flow.next();
    flow.change({ emotion: 5, tags: [], comment: '' });
    expect(service.submit).toHaveBeenCalledOnce();
    expect(flow.back()).toBe(false);
    flow.cancel();
    resolve({ kind: 'already', record });
    await pending;
    expect(service.cancel).toHaveBeenCalledOnce();
    expect(flow.getSnapshot()).toMatchObject({
      step: 1,
      pending: false,
      draft: { emotion: 1, comment: 'draft' },
    });
    expect(rated).not.toHaveBeenCalled();
    expect(flow.back()).toBe(true);
  });
  it('keeps drafts on failed detail, clears errors on edit and permits explicit retry', async () => {
    const { flow, service, detailed } = setup();
    await flow.next();
    await flow.next();
    service.sendDetail.mockResolvedValueOnce({
      kind: 'business',
      reason: 'wrong_token',
      message: 'server message',
    });
    await flow.next();
    expect(flow.getSnapshot()).toMatchObject({
      step: 3,
      failure: { reason: 'wrong_token' },
    });
    expect(detailed).not.toHaveBeenCalled();
    flow.change({ ...flow.getSnapshot().draft, comment: 'retry draft' });
    expect(flow.getSnapshot().failure).toBeUndefined();
    await flow.next();
    expect(flow.getSnapshot().step).toBe(4);
  });
  it('uses server branch after editing rating and drops tags from the other branch', async () => {
    const { flow, service, saved } = setup();
    await flow.next();
    flow.change({ emotion: 3, tags: ['Остыло'], comment: 'preserved' });
    flow.back();
    service.submit.mockResolvedValueOnce({
      ...saved,
      record: {
        ...record,
        fb: { id: 1, token: 'synthetic', rating: 3, branch: 'positive' },
      },
    });
    await flow.next();
    expect(flow.getSnapshot()).toMatchObject({
      step: 2,
      branch: 'positive',
      draft: { tags: [], comment: 'preserved' },
    });
  });
  it('shows already confirmation without reporting a guessed rating or constructing an edit token', async () => {
    const { flow, service, rated } = setup();
    service.submit.mockResolvedValueOnce({
      kind: 'already',
      record,
      message: 'already accepted',
    });
    await flow.next();
    expect(flow.getSnapshot()).toMatchObject({
      step: 4,
      already: 'already accepted',
    });
    expect(rated).not.toHaveBeenCalled();
    expect(flow.back()).toBe(false);
  });
  it('treats thrown transport failures as retryable without automatically repeating', async () => {
    const { flow, service } = setup();
    service.submit.mockRejectedValueOnce(new Error('transport'));
    await flow.next();
    expect(flow.getSnapshot()).toMatchObject({
      step: 1,
      pending: false,
      failure: { kind: 'api', error: { kind: 'network' } },
    });
    expect(service.submit).toHaveBeenCalledOnce();
    await flow.skip();
    expect(flow.getSnapshot().step).toBe(1);
  });
  it('restores persisted feedback and completed states and publishes immutable snapshots', () => {
    const { service } = setup();
    const options = {
      service,
      rated: vi.fn(),
      detailed: vi.fn(),
      finish: vi.fn(),
    };
    const flow = createRatingFlow({
      ...options,
      record: {
        ...record,
        fb: { id: 1, token: 'synthetic', rating: 5, branch: 'positive' },
      },
    });
    expect(flow.getSnapshot()).toMatchObject({
      step: 2,
      draft: { emotion: 5 },
    });
    const listener = vi.fn(),
      unsubscribe = flow.subscribe(listener),
      previous = flow.getSnapshot();
    expect(flow.getSnapshot().canGoBack).toBe(false);
    expect(flow.back()).toBe(true);
    expect(previous.step).toBe(2);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    flow.change({ ...flow.getSnapshot().draft, emotion: 4 });
    expect(listener).not.toHaveBeenCalled();
    expect(
      createRatingFlow({
        ...options,
        record: { ...record, done: true },
      }).getSnapshot().step,
    ).toBe(4);
  });
  it('records only real steps and discards navigation history when scenario closes', async () => {
    const { flow, service } = setup();
    expect(flow.getSnapshot().canGoBack).toBe(false);
    await flow.next();
    expect(flow.getSnapshot().canGoBack).toBe(true);
    await flow.next();
    flow.change({
      ...flow.getSnapshot().draft,
      comment: 'private retained draft',
    });
    flow.cancel();
    expect(flow.getSnapshot()).toMatchObject({
      step: 3,
      canGoBack: false,
      draft: { comment: 'private retained draft' },
    });
    expect(flow.back()).toBe(true);
    expect(flow.getSnapshot().step).toBe(3);
    expect(service.sendDetail).not.toHaveBeenCalled();
  });
  it('offers no Back after completion, as the thanks frames leave that slot empty', async () => {
    // Figma 556:14267 / 556:14278: «Пустой слот · без навигации».
    const { flow, service } = setup();
    await flow.next();
    await flow.next();
    await flow.next();
    expect(flow.getSnapshot()).toMatchObject({ step: 4, canGoBack: false });
    expect(service.sendDetail).toHaveBeenCalledOnce();
  });
});

describe('neutral emotion default (approved 15 October)', () => {
  it('starts at 3 but submits only on explicit Next', async () => {
    const { flow, service } = setup('negative', false);
    expect(flow.getSnapshot().draft.emotion).toBe(3);
    expect(service.submit).not.toHaveBeenCalled();
    await flow.next();
    expect(service.submit).toHaveBeenCalledWith(3);
  });
  it('keeps the emotion of an already saved rating', () => {
    const service = { submit: vi.fn(), sendDetail: vi.fn(), cancel: vi.fn() };
    const flow = createRatingFlow({
      service,
      record: {
        ...record,
        fb: { id: 1, token: 'synthetic', rating: 2, branch: 'negative' },
      },
      rated: vi.fn(),
      detailed: vi.fn(),
      finish: vi.fn(),
    });
    expect(flow.getSnapshot().draft.emotion).toBe(2);
  });
});

it('preserves and removes the optional Other explanation as the reason changes', async () => {
  const { flow, service } = setup();
  await flow.next();
  flow.change({
    ...flow.getSnapshot().draft,
    tags: ['Другое'],
    other: 'Соус',
    comment: 'Спасибо',
  });
  await flow.next();
  expect(flow.getSnapshot().draft.comment).toBe('Соус\nСпасибо');
  flow.back();
  flow.change({ ...flow.getSnapshot().draft, tags: [] });
  await flow.next();
  expect(flow.getSnapshot().draft.comment).toBe('Спасибо');
  flow.back();
  flow.change({ ...flow.getSnapshot().draft, tags: ['Другое'] });
  await flow.next();
  await flow.next();
  expect(service.sendDetail).toHaveBeenCalledWith(['Другое'], 'Соус\nСпасибо');
});
it('acknowledges the saved rating on expired details without claiming that details arrived', async () => {
  const { flow, service, detailed } = setup();
  await flow.next();
  await flow.next();
  service.sendDetail.mockResolvedValueOnce({
    kind: 'business',
    reason: 'expired',
  });
  await flow.next();
  expect(flow.getSnapshot()).toMatchObject({
    step: 4,
    already: 'Время истекло, но оценку мы записали — спасибо',
  });
  expect(detailed).not.toHaveBeenCalled();
});
