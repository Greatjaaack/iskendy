import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { boardQrSrc, getHealth } from '../api/endpoints/guest';
import { tvView } from '../domain/tv/view';
import { BoardPoller, useBoard } from '../polling/BoardPoller';
import { connectivity, isGuestOffline } from '../polling/connectivity';
import { scheduleHealthyReload } from '../platform/tv-reload';
import { TvBoard } from '../ui/TvBoard/TvBoard';
import { useGuestClock } from './guest-clock';
import { createAppQueryClient } from './providers';

/** TV 02: «no connection» only after a minute of failures, so a blink stays invisible. */
export const TV_OFFLINE_AFTER_MS = 60_000;
const TV_TITLE = 'Искенди — табло заказов';

function TvScreen({ store }: { store: typeof connectivity }) {
  const board = useBoard();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const now = useGuestClock();
  const view = tvView(board, isGuestOffline(state, now, TV_OFFLINE_AFTER_MS));
  return (
    <TvBoard
      state={view.state}
      preparing={view.preparing.numbers}
      preparingMore={view.preparing.more}
      ready={view.ready.numbers}
      readyMore={view.ready.more}
      qrSrc={boardQrSrc(location.origin)}
    />
  );
}

/** Hall TV (/tv): no guest storage, telemetry, Metrika or service worker. */
export function TvApp({
  store = connectivity,
}: {
  store?: typeof connectivity;
}) {
  const [client] = useState(createAppQueryClient);
  useEffect(() => {
    document.title = TV_TITLE;
    return scheduleHealthyReload({
      isHealthy: async () => (await getHealth()).ok,
      reload: () => location.reload(),
    });
  }, []);
  return (
    <QueryClientProvider client={client}>
      <BoardPoller audience="tv" store={store} />
      <TvScreen store={store} />
    </QueryClientProvider>
  );
}
