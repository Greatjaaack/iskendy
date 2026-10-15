import { describe, expect, it, vi } from 'vitest';
import { holdScreen } from '../../src/platform/wake-lock';

function fakeDocument(visible = true) {
  const listeners = new Set<() => void>();
  return {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
    fire() {
      listeners.forEach((listener) => listener());
    },
  } as unknown as Document & { fire(): void; visibilityState: string };
}
const sentinel = () => ({ release: vi.fn(async () => {}) });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Screen Wake Lock while an order is cooking (UX-14)', () => {
  it('takes the lock, retakes it after the tab returns and releases on stop', async () => {
    const locks = [sentinel(), sentinel()];
    const request = vi.fn(async () => locks.shift()!);
    const doc = fakeDocument();
    const stop = holdScreen({ wakeLock: { request } }, doc);
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    doc.fire();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    const second = (await request.mock.results[1]!.value) as ReturnType<
      typeof sentinel
    >;
    stop();
    expect(second.release).toHaveBeenCalled();
  });
  it('does nothing without support or while hidden, and never throws', async () => {
    expect(() => holdScreen({}, fakeDocument())()).not.toThrow();
    const request = vi.fn(async () => sentinel());
    holdScreen({ wakeLock: { request } }, fakeDocument(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
    const rejecting = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    holdScreen({ wakeLock: { request: rejecting } }, fakeDocument());
    await flush();
    expect(rejecting).toHaveBeenCalled();
  });
  it('releases a lock that arrives after stop', async () => {
    const late = sentinel();
    let resolve!: (value: typeof late) => void;
    const request = vi.fn(
      () => new Promise<typeof late>((done) => (resolve = done)),
    );
    const stop = holdScreen({ wakeLock: { request } }, fakeDocument());
    stop();
    resolve(late);
    await flush();
    expect(late.release).toHaveBeenCalled();
  });
});
