import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocation } from './router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppProviders } from './providers';
import { ScreenBoundary } from './ScreenBoundary';
import { BOARD_KEY, useBoardQueryState } from '../polling/BoardPoller';
import { connectivity, isGuestOffline } from '../polling/connectivity';
import { guestOrderStorage as orderStorage } from '../storage/guestOrderStorage';
import { advanceOrder } from '../domain/order/machine';
import { getConfig } from '../api/endpoints/guest';
import { checkedFeedback } from '../api/endpoints/checked-feedback';
import type { Board } from '../api/schemas/guest';
import { createCollectionOwner } from '../domain/order/collection-owner';
import { arrangeStack, stripStatus } from '../domain/order/stack';
import type { OrderRecord } from '../storage/schemas';
import { guestOfflineAfterMs } from '../config/features';
import styles from './App.module.css';
import { orderRecordSchema } from '../storage/schemas';
import { useGuestClock } from './guest-clock';
import { GuestSignalsContext, useGuestSignals } from './guest-signals-context';
import { guestSignals, type GuestSignals } from '../platform/guest-signals';

import {
  GuestTelemetryContext,
  useGuestTelemetry,
} from './guest-telemetry-context';
import {
  guestTelemetry,
  type GuestTelemetry,
} from '../platform/guest-telemetry';
import { GuestExperience } from '../screens/Review/GuestExperience';
const Rating = lazy(() =>
  import('./lazy-screens').then((module) => ({
    default: module.Rating,
  })),
);

function GuestApp() {
  const client = useQueryClient();
  // UX-15: «Заказ № N готов» for 5 s on «Мои заказы» (Web/ReadyToast 664:23495).
  const [toast, setToast] = useState<number | null>(null);
  const signals = useGuestSignals();
  const telemetry = useGuestTelemetry();
  const owner = useMemo(
    () =>
      createCollectionOwner({
        readOrders: orderStorage.readOrders,
        readBoard: () => client.getQueryData<Board>(BOARD_KEY) ?? null,
        patch: orderStorage.patch,
        check: (number, signal) => checkedFeedback(number, { signal }),
        promptDelaySec: () => {
          const response = client.getQueryData<
            Awaited<ReturnType<typeof getConfig>>
          >(['guest-config']);
          return response?.ok ? response.data.promptDelaySec : 180;
        },
        onReady: (number) => {
          telemetry.ready(number);
          signals.ready(number);
          setToast(number);
        },
        onRatingPrompt: (number) => {
          telemetry.ratingShown(number);
          signals.rating(number);
        },
      }),
    [client, signals, telemetry],
  );
  const location = useLocation(),
    params = new URLSearchParams(location.search);
  const boardQuery = useBoardQueryState();
  const board = boardQuery?.data;
  const snapshot = useSyncExternalStore(
    orderStorage.subscribe,
    orderStorage.readSnapshot,
  );
  const collectionSnapshot = useSyncExternalStore(
    orderStorage.subscribe,
    orderStorage.readCollectionSnapshot,
  );
  const records = useMemo(
    () =>
      (JSON.parse(collectionSnapshot) as OrderRecord[]).filter(
        (record) => !board || record.d === board.date,
      ),
    [collectionSnapshot, board],
  );
  // The tab's selected order (iskendy_selected_order_v1, ADR-019); never from the URL (SEC-02).
  const selected = useMemo(() => {
    try {
      const parsed = orderRecordSchema.safeParse(
        JSON.parse(snapshot ?? 'null'),
      );
      return parsed.success ? { n: parsed.data.n, d: parsed.data.d } : null;
    } catch {
      return null;
    }
  }, [snapshot]);
  const now = useGuestClock();
  const connection = useSyncExternalStore(
    connectivity.subscribe,
    connectivity.getSnapshot,
  );
  const offline = isGuestOffline(connection, now, guestOfflineAfterMs);
  const config = useQuery({
    queryKey: ['guest-config'],
    queryFn: () => getConfig(),
    staleTime: Infinity,
  });
  const promptDelaySec = config.data?.ok
    ? config.data.data.promptDelaySec
    : 180;
  const mapsHref = config.data?.ok ? config.data.data.links.yandex : undefined;
  const stateOf = (record: OrderRecord) =>
    advanceOrder(record, board ?? null, now, promptDelaySec).state;
  const open = arrangeStack(records, stateOf, selected).open;
  const openState = open ? stateOf(open) : 'none';
  const help = params.get('view') === 'help';
  const queue =
    location.pathname === '/board' &&
    params.get('my') !== '1' &&
    params.get('view') === 'queue';
  const hasOrders = records.length > 0;
  const status = open
    ? (({ ready: 'ready', issued: 'issued', rated: 'issued' } as const)[
        stripStatus(openState, open) as 'ready' | 'issued' | 'rated'
      ] ?? 'preparing')
    : 'preparing';
  useEffect(() => telemetry.mount(), [telemetry]);
  // ADR-019: past days leave the journal on the first board answer.
  useEffect(() => {
    if (board?.date) orderStorage.keepDay(board.date);
  }, [board?.date]);
  const telemetryScreen = help
    ? 'help'
    : queue
      ? 'queue'
      : hasOrders
        ? 'order'
        : 'entry';
  useEffect(
    () => telemetry.screen(telemetryScreen),
    [telemetry, telemetryScreen],
  );
  useEffect(() => {
    telemetry.observeReady(Boolean(board) && openState === 'ready');
  }, [telemetry, now, board, openState]);
  useEffect(() => {
    owner.tick(now);
  }, [owner, now, board, collectionSnapshot]);
  useEffect(() => {
    const cleanup = signals.installGestureUnlock();
    void signals.initialize().catch(() => {});
    return cleanup;
  }, [signals]);
  useEffect(() => () => owner.cancel(), [owner]);
  // Commit route focus before paint so a late passive effect cannot steal an initial input gesture.
  useLayoutEffect(() => {
    const heading = document.querySelector<HTMLElement>('main h1, header h1');
    document.title = (heading?.textContent ?? 'Искенди') + ' · Искенди';
    // The rating dialog owns focus and scroll while it opens.
    if (new URLSearchParams(location.search).get('rate') === '1') return;
    heading?.focus({ preventScroll: true });
    if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const closeToast = useCallback(() => setToast(null), []);
  return (
    <GuestExperience
      records={records}
      selected={selected}
      board={board ?? null}
      now={now}
      promptDelaySec={promptDelaySec}
      offline={offline}
      loading={!boardQuery || boardQuery.status === 'pending'}
      failed={boardQuery?.status === 'error'}
      toast={toast}
      closeToast={closeToast}
      rating={
        <>
          {records
            .filter((r) => Boolean(r.servedAt || r.rated || r.done || r.fb))
            .map((r) => (
              <ScreenBoundary
                key={[r.d, r.n, r.subAt ?? 0].join(':')}
                onFailure={telemetry.renderFailed}
              >
                <Suspense fallback={null}>
                  <Rating
                    record={r}
                    open={
                      params.get('rate') === '1' &&
                      status === 'issued' &&
                      r.n === open?.n &&
                      r.d === open?.d
                    }
                    mapsHref={mapsHref}
                  />
                </Suspense>
              </ScreenBoundary>
            ))}
        </>
      }
    />
  );
}
export function App({
  signals = guestSignals,
  telemetry = guestTelemetry,
}: { signals?: GuestSignals; telemetry?: GuestTelemetry } = {}) {
  return (
    <>
      <GuestSignalsContext value={signals}>
        <GuestTelemetryContext value={telemetry}>
          {/* docs/02 §12: anything outside a screen still ends in «Обновить». */}
          <ScreenBoundary
            screen={styles.board}
            onFailure={telemetry.renderFailed}
          >
            <AppProviders>
              <GuestApp />
            </AppProviders>
          </ScreenBoundary>
        </GuestTelemetryContext>
      </GuestSignalsContext>
    </>
  );
}
