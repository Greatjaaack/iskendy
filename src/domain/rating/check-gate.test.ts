import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackCheckGate } from './check-gate';
import type { checkFeedback } from '../../api/endpoints/guest';
describe('shared fresh feedback check gate', () => {
  it('reads the injected interval clock after the gate was constructed', async () => {
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    let intervalTime = 0;
    const check = createFeedbackCheckGate(read, () => intervalTime);
    await check(1);
    intervalTime += 20000;
    await check(1);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('keeps the cooldown when the wall clock jumps forward', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'],
    });
    vi.setSystemTime(100000);
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    const check = createFeedbackCheckGate(read);
    await check(1);
    vi.setSystemTime(100000 + 3600000);
    const controller = new AbortController();
    const pending = check(1, { signal: controller.signal });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(20000);
      expect(await pending).toMatchObject({ data: { reason: 'not_found' } });
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      controller.abort();
    }
  });
  it('does not extend the cooldown when the wall clock jumps backward', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'],
    });
    vi.setSystemTime(100000 + 3600000);
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    const check = createFeedbackCheckGate(read);
    await check(1);
    vi.setSystemTime(100000);
    const controller = new AbortController();
    const pending = check(1, { signal: controller.signal });
    try {
      await vi.advanceTimersByTimeAsync(19999);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(2);
      expect(await pending).toMatchObject({ data: { reason: 'not_found' } });
    } finally {
      controller.abort();
    }
  });
  afterEach(() => vi.useRealTimers());
  it('serialises the same number, waits twenty seconds, and fetches fresh results', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_served' },
    });
    const check = createFeedbackCheckGate(read);
    await check(997);
    const pending = check(997);
    await vi.advanceTimersByTimeAsync(19999);
    expect(read).toHaveBeenCalledTimes(1);
    read.mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'already' },
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ data: { reason: 'already' } });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('never overlaps same-number reads while another number proceeds', async () => {
    vi.useFakeTimers();
    let finishFirst!: () => void;
    let firstRead = true;
    const read = vi.fn<typeof checkFeedback>().mockImplementation((number) => {
      if (number === 1 && firstRead) {
        firstRead = false;
        return new Promise((resolve) => {
          finishFirst = () =>
            resolve({ ok: true, data: { ok: false, reason: 'not_found' } });
        });
      }
      return Promise.resolve({
        ok: true,
        data: { ok: false, reason: 'not_served' },
      });
    });
    const check = createFeedbackCheckGate(read);
    const first = check(1);
    await vi.advanceTimersByTimeAsync(0);
    const next = check(1);
    await check(2);
    await vi.advanceTimersByTimeAsync(20000);
    expect(read.mock.calls.map(([number]) => number)).toEqual([1, 2]);
    finishFirst();
    expect(await first).toMatchObject({ data: { reason: 'not_found' } });
    expect(await next).toMatchObject({ data: { reason: 'not_served' } });
    expect(read.mock.calls.map(([number]) => number)).toEqual([1, 2, 1]);
  });
  it('allows different numbers independently and drops expired timing records', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    const check = createFeedbackCheckGate(read);
    await check(1);
    await check(2);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(121000);
    await check(2);
    await check(1);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it('cancels queued timing waits without fetching, then permits another action', async () => {
    vi.useFakeTimers();
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    const check = createFeedbackCheckGate(read);
    await check(1);
    const controller = new AbortController();
    const pending = check(1, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } });
    expect(read).toHaveBeenCalledOnce();
    const again = check(1);
    await vi.advanceTimersByTimeAsync(20000);
    await again;
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('rejects already cancelled requests without fetching or occupying the cooldown', async () => {
    const read = vi.fn<typeof checkFeedback>().mockResolvedValue({
      ok: true,
      data: { ok: false, reason: 'not_found' },
    });
    const check = createFeedbackCheckGate(read),
      controller = new AbortController();
    controller.abort();
    expect(await check(1, { signal: controller.signal })).toMatchObject({
      error: { kind: 'aborted' },
    });
    await check(1);
    expect(read).toHaveBeenCalledOnce();
  });
});
