import { act, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextInterval } from '../../src/polling/interval';
import {
  createConnectivity,
  isGuestOffline,
  isStaffOffline,
} from '../../src/polling/connectivity';
import {
  BOARD_KEY,
  BoardPoller,
  useBoard,
  waitForBoard,
} from '../../src/polling/BoardPoller';
import { AppProviders, createAppQueryClient } from '../../src/app/providers';
import type { Board } from '../../src/api/schemas/guest';
import type { ApiResult } from '../../src/api/errors';
const board: Board = {
  date: '2026-10-07',
  orders: [],
  servedCount: 0,
  updatedAt: '',
  now: '13:00',
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('interval policy', () => {
  it.each(['guest', 'tv', 'staff'] as const)(
    'uses documented backoff for %s',
    (audience) => {
      expect(
        [0, 1, 2, 3, 4, 5, 6].map((failures) =>
          nextInterval({ visible: true, failures, audience }),
        ),
      ).toEqual(
        audience === 'staff'
          ? [5000, 5000, 10000, 10000, 10000, 10000, 10000]
          : [5000, 5000, 10000, 20000, 40000, 60000, 60000],
      );
      expect(nextInterval({ visible: false, failures: 0, audience })).toBe(
        20000,
      );
    },
  );
});
describe('connectivity store', () => {
  it('counts only completed failures, preserves last-success time and ignores aborts', () => {
    const store = createConnectivity(),
      callback = vi.fn(),
      unsubscribe = store.subscribe(callback);
    expect(isGuestOffline(store.getSnapshot(), 1)).toBe(false);
    store.fail({ kind: 'aborted' }, 1);
    expect(callback).not.toHaveBeenCalled();
    expect(store.succeed(100)).toBe(0);
    store.fail({ kind: 'network' }, 5000);
    expect(store.getSnapshot()).toMatchObject({
      consecutiveFailures: 1,
      lastSuccessAt: 100,
      offlineSince: 100,
    });
    expect(isStaffOffline(store.getSnapshot())).toBe(false);
    expect(isGuestOffline(store.getSnapshot(), 30099)).toBe(false);
    store.fail({ kind: 'timeout' }, 10000);
    expect(isStaffOffline(store.getSnapshot())).toBe(true);
    expect(isGuestOffline(store.getSnapshot(), 30100)).toBe(true);
    expect(store.succeed(31000)).toBe(30900);
    expect(isStaffOffline(store.getSnapshot())).toBe(false);
    unsubscribe();
    callback.mockClear();
    store.fail({ kind: 'network' }, 50000);
    expect(callback).not.toHaveBeenCalled();
  });
  it('begins an outage at first completed failure if no success has arrived', () => {
    const store = createConnectivity();
    store.fail({ kind: 'network' }, 100);
    expect(store.getSnapshot().offlineSince).toBe(100);
    expect(store.succeed(50)).toBe(0);
  });
});
function Consumer() {
  const data = useBoard();
  return <p>{data?.now ?? 'waiting'}</p>;
}
describe('single query owner', () => {
  it('uses explicit safe Query defaults', () => {
    expect(createAppQueryClient().getDefaultOptions()).toMatchObject({
      queries: {
        retry: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
      },
      mutations: { retry: 0 },
    });
  });
  it('starts once with two passive consumers and prevents overlapping refetches', async () => {
    vi.useFakeTimers();
    const client = createAppQueryClient();
    let finish!: (result: ApiResult<Board>) => void;
    const loadBoard = vi.fn(
      () =>
        new Promise<ApiResult<Board>>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(
      <QueryClientProvider client={client}>
        <BoardPoller
          audience="guest"
          loadBoard={loadBoard}
          store={createConnectivity()}
        />
        <Consumer />
        <Consumer />
      </QueryClientProvider>,
    );
    expect(loadBoard).toHaveBeenCalledOnce();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loadBoard).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ ok: true, data: board });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getAllByText('13:00')).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loadBoard).toHaveBeenCalledTimes(2);
    view.unmount();
    client.clear();
  });
  it('updates connectivity on failure, backs off, and reports a long recovery once', async () => {
    vi.useFakeTimers();
    const client = createAppQueryClient(),
      store = createConnectivity(),
      onRecovery = vi.fn();
    store.succeed(Date.now() - 40000);
    store.fail({ kind: 'network' }, Date.now() - 30000);
    const loadBoard = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
      .mockResolvedValue({ ok: true, data: board });
    const view = render(
      <QueryClientProvider client={client}>
        <BoardPoller
          audience="guest"
          loadBoard={loadBoard}
          store={store}
          onRecovery={onRecovery}
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(store.getSnapshot().consecutiveFailures).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(onRecovery).toHaveBeenCalledOnce();
    expect(store.getSnapshot().consecutiveFailures).toBe(0);
    view.unmount();
    client.clear();
  });
  it('slows a hidden tab and immediately refreshes when visible again', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    );
    const client = createAppQueryClient(),
      loadBoard = vi.fn().mockResolvedValue({ ok: true, data: board });
    const view = render(
      <QueryClientProvider client={client}>
        <BoardPoller
          audience="guest"
          loadBoard={loadBoard}
          store={createConnectivity()}
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(loadBoard).toHaveBeenCalledOnce();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadBoard).toHaveBeenCalledOnce();
    await act(async () => {
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadBoard).toHaveBeenCalledTimes(2);
    view.unmount();
    client.clear();
  });
  it('wires the provider to the actual typed API with no mutation retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(board), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const view = render(
      <AppProviders>
        <Consumer />
      </AppProviders>,
    );
    expect(await screen.findByText('13:00')).toBeInTheDocument();
    view.unmount();
  });
});

describe('W5-1 executed polling contracts', () => {
  it('uses actual GET no-store, aborts a six-second timeout, and never overlaps visibility refetches', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    );
    let active = 0,
      maximum = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((_path, options) => {
        active++;
        maximum = Math.max(maximum, active);
        if (fetcher.mock.calls.length > 1) {
          active--;
          return Promise.resolve(
            new Response(JSON.stringify(board), {
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              active--;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      });
    vi.stubGlobal('fetch', fetcher);
    const client = createAppQueryClient(),
      store = createConnectivity();
    const view = render(
      <QueryClientProvider client={client}>
        <BoardPoller audience="guest" store={store} />
        <Consumer />
        <Consumer />
      </QueryClientProvider>,
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]).toMatchObject([
      '/api/status',
      { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
    ]);
    await act(async () => {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(store.getSnapshot().consecutiveFailures).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(store.getSnapshot().consecutiveFailures).toBe(1);
    expect(active).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
    expect(store.getSnapshot().consecutiveFailures).toBe(0);
    view.unmount();
    client.clear();
  });
  it('executes the guest backoff ladder without retries, retains cached data, and resets after recovery', async () => {
    vi.useFakeTimers();
    const client = createAppQueryClient(),
      store = createConnectivity(),
      recovery = vi.fn();
    client.setQueryData(['board'], board);
    store.succeed(Date.now());
    let calls = 0;
    const starts: number[] = [];
    const loadBoard = vi.fn(async (): Promise<ApiResult<Board>> => {
      calls++;
      starts.push(Date.now());
      return calls <= 5
        ? { ok: false, error: { kind: 'network' } }
        : { ok: true, data: { ...board, now: '13:01' } };
    });
    const view = render(
      <QueryClientProvider client={client}>
        <BoardPoller
          audience="guest"
          store={store}
          loadBoard={loadBoard}
          onRecovery={recovery}
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadBoard).toHaveBeenCalledOnce();
    expect(client.getQueryData<Board>(['board'])?.now).toBe('13:00');
    for (const [index, interval] of [
      5000, 10000, 20000, 40000, 60000,
    ].entries()) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          starts.at(-1)! + interval - Date.now() - 1,
        );
      });
      expect(loadBoard).toHaveBeenCalledTimes(index + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2);
      });
      expect(loadBoard).toHaveBeenCalledTimes(index + 2);
    }
    expect(store.getSnapshot().consecutiveFailures).toBe(0);
    expect(client.getQueryData<Board>(['board'])?.now).toBe('13:01');
    expect(recovery).toHaveBeenCalledOnce();
    expect(recovery.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(135000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5001);
    });
    expect(loadBoard).toHaveBeenCalledTimes(7);
    expect(recovery).toHaveBeenCalledOnce();
    view.unmount();
    client.clear();
  });
  it.each([10000, 30000, 30001])(
    'records the existing recovery report threshold at %s ms',
    async (duration) => {
      vi.useFakeTimers();
      const client = createAppQueryClient(),
        store = createConnectivity(),
        recovery = vi.fn();
      store.succeed(Date.now() - duration);
      store.fail({ kind: 'network' }, Date.now());
      const loadBoard = vi.fn().mockResolvedValue({ ok: true, data: board });
      const view = render(
        <QueryClientProvider client={client}>
          <BoardPoller
            audience="guest"
            store={store}
            loadBoard={loadBoard}
            onRecovery={recovery}
          />
        </QueryClientProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(recovery).toHaveBeenCalledTimes(duration > 30000 ? 1 : 0);
      if (duration > 30000) expect(recovery).toHaveBeenCalledWith(duration);
      expect(store.getSnapshot().consecutiveFailures).toBe(0);
      view.unmount();
      client.clear();
    },
  );
  it('aborts the owned pending status request on unmount and schedules no further polls', async () => {
    vi.useFakeTimers();
    const client = createAppQueryClient(),
      store = createConnectivity();
    let signal!: AbortSignal;
    const loadBoard = vi.fn((requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<ApiResult<Board>>((resolve) =>
        requestSignal.addEventListener(
          'abort',
          () => resolve({ ok: false, error: { kind: 'aborted' } }),
          { once: true },
        ),
      );
    });
    const view = render(
      <QueryClientProvider client={client}>
        <BoardPoller audience="guest" store={store} loadBoard={loadBoard} />
      </QueryClientProvider>,
    );
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });
    expect(loadBoard).toHaveBeenCalledOnce();
    expect(store.getSnapshot().consecutiveFailures).toBe(0);
    client.clear();
  });
});

describe('waitForBoard (B1)', () => {
  it('returns the cached board at once', async () => {
    const client = createAppQueryClient();
    client.setQueryData(BOARD_KEY, board);
    expect(await waitForBoard(client, new AbortController().signal)).toBe(
      board,
    );
  });
  it('waits for the first poll instead of reporting offline', async () => {
    const client = createAppQueryClient();
    const pending = waitForBoard(client, new AbortController().signal);
    client.setQueryData(BOARD_KEY, board);
    expect(await pending).toBe(board);
  });
  it('gives up after the timeout or on abort', async () => {
    vi.useFakeTimers();
    const client = createAppQueryClient();
    const late = waitForBoard(client, new AbortController().signal, 8_000);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await late).toBeNull();
    const controller = new AbortController();
    const aborted = waitForBoard(client, controller.signal);
    controller.abort();
    expect(await aborted).toBeNull();
  });
});
