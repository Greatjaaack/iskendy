import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvApp, TV_OFFLINE_AFTER_MS } from '../../src/app/TvApp';
import { createConnectivity } from '../../src/polling/connectivity';
import { scheduleHealthyReload } from '../../src/platform/tv-reload';

const order = (number: number, status: 'preparing' | 'ready') => ({
  number,
  status,
  acceptedAt: '2026-10-20T12:00:00',
  readyAt: null,
  servedAt: null,
});
const status = (orders: ReturnType<typeof order>[]) =>
  new Response(
    JSON.stringify({
      date: '2026-10-20',
      now: '12:00',
      updatedAt: '',
      servedCount: 0,
      orders,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('hall TV', () => {
  it('shows the live board with the QR to /board and nothing guest-only', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        status([order(108, 'preparing'), order(102, 'ready')]),
      );
    render(<TvApp store={createConnectivity()} />);
    expect(
      await within(screen.getByRole('region', { name: 'Готовим' })).findByText(
        '108',
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Готово' })).getByText('102'),
    ).toBeVisible();
    expect(screen.getByRole('img', { name: /QR/ })).toHaveAttribute(
      'src',
      `/api/qr?border=1&data=${encodeURIComponent(`${location.origin}/board`)}`,
    );
    expect(document.title).toBe('Искенди — табло заказов');
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/status',
    ]);
  });
  it('hides numbers only after a minute without the kitchen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let online = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (online) return status([order(108, 'preparing')]);
      throw new TypeError('Failed to fetch');
    });
    render(<TvApp store={createConnectivity()} />);
    expect(await screen.findByText('108')).toBeVisible();
    online = false;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByText('108')).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(TV_OFFLINE_AFTER_MS + 60_000));
    expect(screen.queryByText('108')).not.toBeInTheDocument();
    expect(screen.getByText('Нет связи с кухней')).toBeVisible();
    online = true;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText('108')).toBeVisible();
  });
});

describe('hourly kiosk reload', () => {
  it('reloads only when the server answers', async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const answers = [false, true];
    const stop = scheduleHealthyReload({
      isHealthy: async () => answers.shift() ?? false,
      reload,
      everyMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reload).toHaveBeenCalledOnce();
    stop();
  });
  it('survives a failed health check and stops on cleanup', async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const isHealthy = vi.fn().mockRejectedValue(new TypeError('offline'));
    const stop = scheduleHealthyReload({ isHealthy, reload, everyMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(isHealthy).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });
});
