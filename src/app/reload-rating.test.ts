import { describe, expect, it, vi } from 'vitest';
import { reloadRatingScreen } from './reload-rating';
const origin = 'https://guest.test';
describe('explicit rating cache recovery', () => {
  it('refreshes only the most recent observed local hashed rating module before reload', async () => {
    const reload = vi.fn(),
      fetchAsset = vi.fn().mockResolvedValue({});
    await reloadRatingScreen({
      origin,
      reload,
      fetchAsset,
      entries: () => [
        { name: `${origin}/app/lazy-screens-old.js` },
        { name: 'https://foreign.test/app/lazy-screens-foreign.js' },
        { name: `${origin}/app/lazy-screens-current.js` },
      ],
    });
    expect(fetchAsset).toHaveBeenCalledExactlyOnceWith(
      `${origin}/app/lazy-screens-current.js`,
      expect.objectContaining({
        method: 'GET',
        cache: 'reload',
        credentials: 'omit',
        mode: 'same-origin',
        redirect: 'error',
      }),
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(fetchAsset.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0]!,
    );
  });
  it('never requests arbitrary or credential-bearing resources', async () => {
    const reload = vi.fn(),
      fetchAsset = vi.fn();
    await reloadRatingScreen({
      origin,
      reload,
      fetchAsset,
      entries: () => [
        { name: 'https://foreign.test/app/lazy-screens-a.js' },
        { name: 'https://user@guest.test/app/lazy-screens-a.js' },
        { name: `${origin}/app/lazy-screens-a.js?draft=private` },
        { name: `${origin}/api/feedback` },
        { name: `${origin}/app/mount-a.js` },
      ],
    });
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });
  it('reloads even if the cache refresh or Performance API fails', async () => {
    for (const entries of [
      () => [{ name: `${origin}/app/lazy-screens-a.js` }],
      () => {
        throw new Error('unavailable');
      },
    ]) {
      const reload = vi.fn(),
        fetchAsset = vi.fn().mockRejectedValue(new Error('offline'));
      await reloadRatingScreen({ origin, reload, fetchAsset, entries });
      expect(reload).toHaveBeenCalledOnce();
    }
  });
  it('bounds a stalled cache refresh and reloads after abort', async () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn();
      const fetchAsset = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
      const pending = reloadRatingScreen({
        origin,
        reload,
        fetchAsset,
        entries: () => [{ name: `${origin}/app/lazy-screens-a.js` }],
      });
      expect(reload).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3_000);
      await pending;
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
