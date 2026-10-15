import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBoard } from '../api/endpoints/guest';
import type { Board } from '../api/schemas/guest';
import type { ApiError, ApiResult } from '../api/errors';
import { connectivity, type createConnectivity } from './connectivity';
import { nextInterval } from './interval';

export const BOARD_KEY = ['board'] as const;
const visible = () => document.visibilityState !== 'hidden';
function subscribeVisibility(callback: () => void) {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}
class BoardError extends Error {
  constructor(readonly cause: ApiError) {
    super(cause.kind);
  }
}
const load = (signal: AbortSignal) => getBoard({ signal });
type Props = {
  audience: 'guest' | 'staff' | 'tv';
  store?: ReturnType<typeof createConnectivity>;
  loadBoard?: (signal: AbortSignal) => Promise<ApiResult<Board>>;
  onRecovery?: (durationMs: number) => void;
};
/** Only owner of ['board']. Consumers must never enable their own query or timers. */
export function BoardPoller({
  audience,
  store = connectivity,
  loadBoard = load,
  onRecovery,
}: Props) {
  const client = useQueryClient();
  const isVisible = useSyncExternalStore(subscribeVisibility, visible);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useQuery({
    queryKey: BOARD_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadBoard(signal);
      if (!result.ok) {
        store.fail(result.error, Date.now());
        throw new BoardError(result.error);
      }
      const duration = store.succeed(Date.now());
      if (duration > 30_000) onRecovery?.(duration);
      return result.data;
    },
    retry: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: nextInterval({
      visible: isVisible,
      failures: state.consecutiveFailures,
      audience,
    }),
    refetchIntervalInBackground: true,
  });
  useEffect(() => {
    const returned = () => {
      if (visible())
        void client.refetchQueries(
          { queryKey: BOARD_KEY, type: 'active' },
          { cancelRefetch: false },
        );
    };
    document.addEventListener('visibilitychange', returned);
    return () => document.removeEventListener('visibilitychange', returned);
  }, [client]);
  return null;
}
export function useBoard(): Board | undefined {
  return useBoardQueryState()?.data;
}

/** Read the owner's cache without replacing its query function or retry options. */
export function useBoardQueryState() {
  const client = useQueryClient();
  const subscribe = useCallback(
    (callback: () => void) =>
      client.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] === BOARD_KEY[0]) callback();
      }),
    [client],
  );
  const snapshot = useCallback(
    () => client.getQueryState<Board>(BOARD_KEY),
    [client],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
