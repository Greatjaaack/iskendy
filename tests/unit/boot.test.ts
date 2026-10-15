import { afterEach, describe, expect, it, vi } from 'vitest';
import { frontendFor } from '../../src/boot/routes';
import { startFrontend } from '../../src/boot/start';
import { loadLegacy } from '../../src/boot/legacy';

afterEach(() => vi.useRealTimers());
describe('route isolation', () => {
  it.each(['/', '/board'])('boots only the app on %s', async (path) => {
    const app = vi.fn(async () => {}),
      legacy = vi.fn(async () => {});
    await startFrontend(path, app, legacy);
    expect(app).toHaveBeenCalledOnce();
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(['/tv', '/staff', '/stats', '/unknown', '/staff/'])(
    'never imports the app on %s',
    async (path) => {
      const app = vi.fn(async () => {}),
        legacy = vi.fn(async () => {});
      await startFrontend(path, app, legacy);
      expect(frontendFor(path)).toBe('legacy');
      expect(legacy).toHaveBeenCalledOnce();
      expect(app).not.toHaveBeenCalled();
    },
  );
});
describe('same-URL legacy loader', () => {
  const documentTarget = () => ({
    open: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
  });
  it('replaces only with the pinned same-origin document and disables redirects', async () => {
    const html = '<!doctype html><html lang="ru"><body>Legacy</body></html>';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      );
    const target = documentTarget();
    await loadLegacy(fetcher, target);
    expect(fetcher).toHaveBeenCalledWith(
      '/legacy.html',
      expect.objectContaining({
        cache: 'no-cache',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(target.open).toHaveBeenCalledOnce();
    expect(target.write).toHaveBeenCalledWith(html);
    expect(target.close).toHaveBeenCalledOnce();
  });
  it.each([
    new Response('offline', { status: 503 }),
    new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    new Response('<div>bad</div>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  ])('does not write a failed or unexpected response', async (response) => {
    const target = documentTarget();
    await expect(
      loadLegacy(vi.fn<typeof fetch>().mockResolvedValue(response), target),
    ).rejects.toThrow();
    expect(target.write).not.toHaveBeenCalled();
  });
  it('aborts a stalled request after the bounded timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );
    const request = loadLegacy(fetcher, documentTarget(), 25);
    const rejection = expect(request).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });
});
