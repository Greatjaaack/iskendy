import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from '../../app/router';
import type { Board } from '../../api/schemas/guest';
import { advanceOrder } from '../../domain/order/machine';
import { arrangeStack, stripStatus } from '../../domain/order/stack';
import { ratingHref } from '../../domain/order/routes';
import { sameOrder, type OrderIdentity } from '../../domain/orderCollection';
import { ordersContent as text } from '../../content/orders';
import { ticketContent } from '../../content/order-ticket';
import { holdScreen } from '../../platform/wake-lock';
import { entryContent } from '../../content/entry';
import { inputContent } from '../../content/input';
import { guestOrderStorage as orderStorage } from '../../storage/guestOrderStorage';
import type { OrderRecord } from '../../storage/schemas';
import type { Emotion } from '../../content/emotion';
import { useGuestSignals } from '../../app/guest-signals-context';
import { useGuestTelemetry } from '../../app/guest-telemetry-context';
import { ScreenBoundary } from '../../app/ScreenBoundary';
import { OrderTicket } from '../../ui/OrderTicket/OrderTicket';
import { OrderStrip, CompletedStrip } from '../../ui/OrderStrip/OrderStrip';
import { Button } from '../../ui/Button/Button';
import { Icon } from '../../ui/Icon/Icon';
import { QueueGroups } from '../../ui/QueueGroups/QueueGroups';
import styles from './MyOrders.module.css';

const overlays = () => import('../../app/lazy-screens');
const OrderMenu = lazy(() =>
  overlays().then((module) => ({ default: module.OrderMenu })),
);
const RemoveOrder = lazy(() =>
  overlays().then((module) => ({ default: module.RemoveOrder })),
);
const Notifications = lazy(() =>
  overlays().then((module) => ({ default: module.Notifications })),
);
const IssuedCard = lazy(() =>
  overlays().then((module) => ({ default: module.IssuedCard })),
);
// Below the stack (186 px slot reserved): not part of the first screen.
const extras = () => import('../../app/lazy-extras');
const GameTile = lazy(() =>
  extras().then((module) => ({ default: module.GameTile })),
);
const BoardTile = lazy(() =>
  extras().then((module) => ({ default: module.BoardTile })),
);
const AddOrder = lazy(() =>
  overlays().then((module) => ({ default: module.AddOrder })),
);
type Overlay = 'menu' | 'remove' | 'notifications' | 'add' | null;

/** «Мои заказы», variant A (Figma section 13, 664:23458). Phone: stack → detail
 * with «×» and «⋯». From 768 px: no detail level, «⋯» on the open ticket. */
export function MyOrders({
  records,
  selected,
  board,
  now,
  wide,
  promptDelaySec,
}: {
  records: OrderRecord[];
  selected: OrderIdentity | null;
  board: Board | null;
  now: number;
  wide: boolean;
  promptDelaySec: number;
}) {
  const navigate = useNavigate();
  const signals = useGuestSignals();
  const telemetry = useGuestTelemetry();
  const [detail, setDetail] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [expanded, setExpanded] = useState(false);
  const completedId = useId();
  const dots = useRef<HTMLButtonElement>(null);
  const stateOf = (record: OrderRecord) =>
    advanceOrder(record, board, now, promptDelaySec).state;
  const stack = arrangeStack(records, stateOf, selected);
  // UX-14: keep the screen on while any order is still cooking.
  const cooking = records.some((record) =>
    ['preparing', 'waiting'].includes(stripStatus(stateOf(record), record)),
  );
  useEffect(() => (cooking ? holdScreen() : undefined), [cooking]);
  const permission = signals.permission();
  const note =
    ticketContent.hint[
      permission === 'unsupported' || permission === 'granted'
        ? permission
        : 'off'
    ];
  const open = stack.open!;
  const select = (record: OrderRecord) => {
    if (!selected || !sameOrder(selected, record)) orderStorage.select(record);
  };
  const closeMenu = useCallback((restore: boolean) => {
    setOverlay(null);
    if (restore) dots.current?.focus();
  }, []);
  const focusHeading = (event: Event) => {
    event.preventDefault();
    document.querySelector<HTMLElement>('main h1, main h2')?.focus();
  };
  const showDetail = !wide && detail;
  const actions = (
    <div className={styles.anchor}>
      <button
        ref={dots}
        type="button"
        className={styles.round}
        aria-label={text.menu}
        aria-haspopup="menu"
        aria-expanded={overlay === 'menu'}
        onClick={() => setOverlay(overlay === 'menu' ? null : 'menu')}
      >
        <Icon name="more-horizontal" />
      </button>
      {overlay === 'menu' && (
        <ScreenBoundary onFailure={telemetry.renderFailed}>
          <Suspense fallback={null}>
            <OrderMenu
              anchor={dots}
              showBoard
              onClose={closeMenu}
              onBoard={() => navigate('/board?view=queue')}
              onNotifications={() => setOverlay('notifications')}
              onRemove={() => setOverlay('remove')}
            />
          </Suspense>
        </ScreenBoundary>
      )}
    </div>
  );
  const strips = (stack.active.length > 0 || stack.completed.length > 0) && (
    <div className={styles.stack}>
      {stack.active.map(({ record, status }) => (
        <OrderStrip
          key={record.d + ':' + record.n}
          number={record.n}
          status={status}
          onSelect={() => {
            select(record);
            if (!wide) setDetail(true);
          }}
        />
      ))}
      {stack.completed.length > 0 && (
        <CompletedStrip
          count={stack.completed.length}
          expanded={expanded}
          controls={completedId}
          onToggle={() => setExpanded(!expanded)}
        />
      )}
      <div id={completedId} className={styles.completed}>
        {expanded &&
          stack.completed.map(({ record, status }) => (
            <OrderStrip
              key={record.d + ':' + record.n}
              number={record.n}
              status={status}
              onSelect={() => {
                select(record);
                if (!wide) setDetail(true);
              }}
            />
          ))}
      </div>
    </div>
  );
  const tiles = (
    <div className={styles.tiles}>
      <Suspense fallback={null}>
        <GameTile />
        <BoardTile board={board} onNavigate={navigate} />
      </Suspense>
    </div>
  );
  return (
    <main
      className={[styles.orders, wide ? styles.wide : ''].join(' ')}
      data-view={showDetail ? 'detail' : 'stack'}
    >
      {showDetail ? (
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.round}
            aria-label={text.close}
            onClick={() => setDetail(false)}
          >
            <Icon name="close" />
          </button>
          {actions}
        </div>
      ) : (
        <div className={styles.titleRow}>
          <h1 tabIndex={-1}>{text.title}</h1>
          {wide ? (
            <Button
              label={text.add}
              variant="secondary"
              onClick={() => setOverlay('add')}
            />
          ) : (
            <button
              type="button"
              className={styles.plus}
              aria-label={text.add}
              onClick={() => setOverlay('add')}
            >
              <Icon name="plus" />
            </button>
          )}
        </div>
      )}
      <div className={styles.columns}>
        <section className={styles.column}>
          <div className={styles.card}>
            <OpenOrder
              record={open}
              state={stateOf(open)}
              wide={wide}
              heading={showDetail ? 1 : 2}
              pickup={showDetail}
              note={note}
              onOpen={!wide && !showDetail ? () => setDetail(true) : undefined}
              onRate={(emotion) => {
                const current = orderStorage.read(open);
                if (!current) return;
                if (!current.promptedAt)
                  orderStorage.patch(current, { promptedAt: Date.now() });
                select(current);
                // A tapped face opens R1 with that emotion (UX-16).
                navigate(ratingHref + (emotion ? '&emotion=' + emotion : ''));
              }}
            />
            {wide && <div className={styles.cardActions}>{actions}</div>}
          </div>
          {!showDetail && strips}
          {!showDetail && tiles}
        </section>
        {wide && (
          <aside className={styles.queue}>
            <QueueGroups
              board={board}
              aside
              mine={(number) => records.some((r) => r.n === number)}
            />
          </aside>
        )}
      </div>
      <ScreenBoundary onFailure={telemetry.renderFailed}>
        <Suspense fallback={null}>
          {overlay === 'remove' && (
            <RemoveOrder
              open
              number={open.n}
              wide={wide}
              onOpenChange={(value) => !value && setOverlay(null)}
              onCloseAutoFocus={focusHeading}
              onConfirm={() => {
                orderStorage.remove(open);
                setDetail(false);
                setOverlay(null);
              }}
            />
          )}
          {overlay === 'notifications' && (
            <Notifications
              open
              permission={signals.permission()}
              onOpenChange={(value) => !value && setOverlay(null)}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                dots.current?.focus();
              }}
            />
          )}
          {overlay === 'add' && (
            <AddOrder
              open
              records={records}
              onOpenChange={(value) => !value && setOverlay(null)}
              onCloseAutoFocus={focusHeading}
              onAdded={() => {
                setDetail(false);
                setOverlay(null);
              }}
            />
          )}
        </Suspense>
      </ScreenBoundary>
    </main>
  );
}
function OpenOrder({
  record,
  state,
  wide,
  heading,
  pickup,
  note,
  onOpen,
  onRate,
}: {
  record: OrderRecord;
  state: ReturnType<typeof advanceOrder>['state'];
  wide: boolean;
  heading: 1 | 2;
  /** «Как забрать» lives in the phone detail; stacks go ticket → strips (664:23656). */
  pickup: boolean;
  note: string;
  /** Phone stack: the ticket opens the detail (S3); the card below stays usable. */
  onOpen?: () => void;
  onRate: (emotion?: Emotion) => void;
}): ReactNode {
  const strip = stripStatus(state, record);
  const number = String(record.n);
  const open = onOpen && (
    <button
      type="button"
      className={styles.stretched}
      aria-label={text.open(record.n)}
      onClick={onOpen}
    />
  );
  if (strip === 'notfound')
    return (
      <div className={styles.ticketWrap}>
        <section className={styles.notFound} aria-label={text.number(record.n)}>
          <p className={styles.notFoundNumber}>{text.number(record.n)}</p>
          <p role="status">{inputContent.orderError(number)}</p>
        </section>
        {open}
      </div>
    );
  const status =
    strip === 'ready'
      ? 'ready'
      : strip === 'issued' || strip === 'rated'
        ? 'issued'
        : 'preparing';
  return (
    <>
      <div className={styles.ticketWrap}>
        <OrderTicket
          number={number}
          status={status}
          size={wide ? 'desktop' : 'mobile'}
          pending={strip === 'waiting'}
          heading={heading === 1 ? true : 2}
          cornerAction={wide}
          note={note}
          className={styles.ticket}
        />
        {open}
      </div>
      {status === 'issued' && (
        <ScreenBoundary quiet onFailure={() => {}}>
          <Suspense fallback={null}>
            <IssuedCard number={record.n} onRate={onRate} />
          </Suspense>
        </ScreenBoundary>
      )}
      {pickup && status === 'ready' && (
        <section className={styles.pickup} aria-labelledby="pickup-title">
          <h2 id="pickup-title">{entryContent.pickupTitle}</h2>
          <ol>
            {entryContent.pickupSteps(number).map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
