import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, navigateBack, useLocation, useNavigate } from '../../app/router';
import type { Board } from '../../api/schemas/guest';
import type { OrderRecord } from '../../storage/schemas';
import { guestOrderStorage as storage } from '../../storage/guestOrderStorage';
import { advanceOrder } from '../../domain/order/machine';
import { stripStatus } from '../../domain/order/stack';
import { orderListHref, ratingHref } from '../../domain/order/routes';
import { BOARD_KEY } from '../../polling/BoardPoller';
import { sendManagerMessage } from '../../api/endpoints/guest';
import { useGuestSignals } from '../../app/guest-signals-context';
import { reviewContent as text } from '../../content/review';
import { Entry } from '../Entry/Entry';
import { entryContent } from '../../content/entry';
import { ScreenBoundary } from '../../app/ScreenBoundary';
import { useGuestTelemetry } from '../../app/guest-telemetry-context';
import { Logo } from '../../ui/Brand/Logo';
import { Button } from '../../ui/Button/Button';
import { Input } from '../../ui/Input/Input';
import { Icon } from '../../ui/Icon/Icon';
import { Steps } from '../../ui/Steps/Steps';
import { QueueGroups } from '../../ui/QueueGroups/QueueGroups';
import {
  Attachments,
  type AttachmentDraft,
} from '../../ui/Attachments/Attachments';
import {
  OrderCard,
  ReviewDock,
  IllustratedAction,
  GlassIconButton,
  OrderControls,
  GlassSkeleton,
  type ReviewStatus,
} from '../../ui/Review/ReviewUI';
import styles from './GuestExperience.module.css';
import { VenueCards } from '../../ui/Review/VenueCards';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';

const AddOrder = lazy(() =>
  import('../Orders/OrderOverlays').then((m) => ({ default: m.AddOrder })),
);
const Sheet = lazy(() =>
  import('../../ui/Sheet/Sheet').then((m) => ({ default: m.Sheet })),
);
type Props = {
  records: OrderRecord[];
  selected: { n: number; d: string } | null;
  board: Board | null;
  now: number;
  promptDelaySec: number;
  offline: boolean;
  loading: boolean;
  failed: boolean;
  toast: number | null;
  closeToast: () => void;
  rating: ReactNode;
};
/** One presentation for the three approved layouts. API, storage and polling stay owned by App. */
export function GuestExperience({
  records,
  selected,
  board,
  now,
  promptDelaySec,
  offline,
  loading,
  failed,
  toast,
  closeToast,
  rating,
}: Props) {
  const main = useRef<HTMLElement>(null);
  const motionEnabled = useMotionEnabled();
  const location = useLocation(),
    navigate = useNavigate(),
    params = new URLSearchParams(location.search),
    view = params.get('view');
  const root = view === 'queue' ? 'board' : view === 'help' ? 'help' : 'order';
  const nested = [
    'detail',
    'list',
    'notifications',
    'manager',
    'message',
    'faq',
  ].includes(view ?? '');
  const [typing, setTyping] = useState(false);
  const [add, setAdd] = useState(false),
    [notificationSettings, setNotificationSettings] = useState(false),
    [readAt, setReadAt] = useState(0),
    [permissionVersion, setPermissionVersion] = useState(0);
  const telemetry = useGuestTelemetry();
  const signals = useGuestSignals(),
    client = useQueryClient();
  const carousel = useRef<HTMLDivElement>(null),
    detailCarousel = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [message, setMessage] = useState(''),
    [messageNumber, setMessageNumber] = useState(''),
    [files, setFiles] = useState<AttachmentDraft[]>([]),
    [messageError, setMessageError] = useState(''),
    [sending, setSending] = useState(false),
    [sent, setSent] = useState(false),
    [discard, setDiscard] = useState(false);
  const stateOf = (r: OrderRecord) =>
    stripStatus(advanceOrder(r, board, now, promptDelaySec).state, r);
  const statusOf = (r: OrderRecord): ReviewStatus => {
    const s = stateOf(r);
    return s === 'ready'
      ? 'ready'
      : s === 'issued' || s === 'rated'
        ? 'issued'
        : 'preparing';
  };
  const selectedIndex = Math.max(
      0,
      records.findIndex((r) => r.n === selected?.n && r.d === selected?.d),
    ),
    current = records[selectedIndex];
  const title =
    view === 'detail' && current
      ? text.order(current.n)
      : view === 'notifications'
        ? text.notifications
        : view === 'message'
          ? text.message
          : view === 'list'
            ? text.all
            : view === 'faq'
              ? text.help
              : view === 'manager'
                ? text.help
                : root === 'board'
                  ? text.board
                  : root === 'help'
                    ? text.help
                    : records.length === 0 || typing
                      ? entryContent.title
                      : text.orders;
  const cooking = board?.orders.filter((r) => r.status !== 'ready').length ?? 0,
    ready = board?.orders.filter((r) => r.status === 'ready').length ?? 0;
  const events = records
    .flatMap((record) => {
      const status = statusOf(record);
      return [
        {
          record,
          status,
          at:
            record.servedAt ??
            (status === 'ready'
              ? Date.parse(
                  board?.orders.find((b) => b.number === record.n)?.readyAt ??
                    '',
                ) ||
                record.subAt ||
                0
              : record.subAt || 0),
        },
      ];
    })
    .sort((a, b) => b.at - a.at);
  const unread = events.some((e) => e.at > readAt);
  const back = () =>
    navigateBack(
      view === 'detail'
        ? orderListHref
        : view === 'message'
          ? '/board?view=manager'
          : view === 'faq' || view === 'manager'
            ? '/board?view=help'
            : orderListHref,
    );
  const openOrder = (record: OrderRecord) => {
    storage.select(record);
    navigate('/board?my=1&view=detail');
  };
  const moveDetail = (index: number) => {
    const record = records[index];
    if (record) storage.select(record);
  };
  const moveRoot = (index: number) => {
    const el = carousel.current;
    const child = el?.children[index] as HTMLElement | undefined;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && child && first) {
      el.scrollTo({
        left: child.offsetLeft - first.offsetLeft,
        behavior: 'instant',
      });
      setPosition(index);
    }
  };
  useLayoutEffect(() => {
    if (view !== 'detail' || !detailCarousel.current) {
      const el = carousel.current;
      const first = el?.firstElementChild as HTMLElement | null;
      const child = el?.children[Math.min(position, records.length - 1)] as
        HTMLElement | undefined;
      if (el && first && child)
        el.scrollTo({
          left: child.offsetLeft - first.offsetLeft,
          behavior: 'instant',
        });
      return;
    }
    const children = detailCarousel.current.children;
    const child = children[selectedIndex] as HTMLElement | undefined;
    if (child)
      detailCarousel.current.scrollTo({
        left:
          child.offsetLeft -
          (detailCarousel.current.clientWidth - child.clientWidth) / 2,
        behavior: 'instant',
      });
  }, [view, selectedIndex, records.length, position]);
  useEffect(() => () => clearTimeout(settleTimer.current), [view]);
  const retry = () =>
    void client.refetchQueries(
      { queryKey: BOARD_KEY, type: 'active' },
      { cancelRefetch: false },
    );
  const boardAction = () => navigate('/board?view=queue'),
    managerAction = () => navigate('/board?view=manager');
  const actions = (issued = false) => (
    <div className={styles.services}>
      <IllustratedAction
        kind={issued ? 'review' : 'board'}
        hint={issued ? text.reviewHint : text.boardCount(cooking, ready)}
        onClick={
          issued && current
            ? () => {
                storage.select(current);
                navigate(ratingHref + '&view=detail');
              }
            : boardAction
        }
      />
      <IllustratedAction kind="manager" onClick={managerAction} />
    </div>
  );
  const alertBox = (heading: string, body: string) => (
    <section className={styles.errorPanel}>
      <h2>{heading}</h2>
      <p>{body}</p>
      <Button label={text.retry} onClick={retry} />
      <Button
        variant="secondary"
        label={text.help}
        onClick={() => navigate('/board?view=help')}
      />
    </section>
  );
  const rootOrders = (
    <>
      {loading && !board && records.length > 0 ? (
        <GlassSkeleton />
      ) : failed && !board ? (
        alertBox(text.failedOrders, text.failedHint)
      ) : (
        <>
          <div className={styles.ordersAndActions}>
            <section className={styles.ordersArea} aria-label={text.orders}>
              {records.length === 0 || typing ? (
                <Entry embedded onTyping={setTyping} />
              ) : (
                <>
                  <div
                    ref={carousel}
                    className={styles.carousel}
                    data-count={Math.min(records.length, 3)}
                    onScroll={(event) => {
                      const el = event.currentTarget;
                      const first = el.firstElementChild as HTMLElement | null;
                      if (first)
                        setPosition(
                          Math.min(
                            records.length - 1,
                            Math.round(
                              el.scrollLeft / (first.clientWidth + 12),
                            ),
                          ),
                        );
                    }}
                  >
                    {records.map((record) =>
                      stateOf(record) === 'notfound' ? (
                        <article
                          key={record.d + record.n}
                          data-card-root
                          aria-label={text.yourOrder + ' ' + record.n}
                        >
                          {alertBox(text.notFound, text.questions[2].body)}
                        </article>
                      ) : (
                        <OrderCard
                          key={record.d + record.n}
                          number={record.n}
                          status={statusOf(record)}
                          pending={stateOf(record) === 'waiting'}
                          onClick={() => openOrder(record)}
                        />
                      ),
                    )}
                  </div>
                  {records.length > 1 && (
                    <OrderControls
                      current={Math.min(position, records.length - 1)}
                      total={records.length}
                      onChange={moveRoot}
                    />
                  )}
                </>
              )}
            </section>
            <div className={styles.quickActions}>
              <button
                type="button"
                aria-label={text.add}
                data-cursor-label={text.cursorAdd}
                data-hover-card
                onClick={() => setAdd(true)}
              >
                <span className={styles.quickIcon}>
                  <Icon name="plus" />
                </span>
                <strong>{text.add}</strong>
                <span>{text.checkNumber}</span>
              </button>
              <button
                type="button"
                aria-label={text.all}
                data-cursor-label={text.cursorGo}
                data-hover-card
                onClick={() => navigate('/board?my=1&view=list')}
              >
                <span className={styles.quickIcon}>
                  <Icon name="receipt" />
                </span>
                <strong>{text.all}</strong>
                <span>{text.allHint}</span>
              </button>
            </div>
          </div>
          <div className={styles.services}>
            <IllustratedAction kind="game" />
            <IllustratedAction
              kind="board"
              hint={text.boardCount(cooking, ready)}
              onClick={boardAction}
            />
          </div>
        </>
      )}
    </>
  );
  let content: ReactNode =
    records.length === 0 || typing ? (
      <Entry embedded onTyping={setTyping} />
    ) : (
      rootOrders
    );
  if (view === 'detail')
    content = current ? (
      <>
        <div className={styles.detailLayout}>
          <div>
            <div
              ref={detailCarousel}
              className={styles.detailCarousel}
              data-count={records.length === 1 ? 'one' : 'many'}
              onScroll={(event) => {
                const el = event.currentTarget;
                clearTimeout(settleTimer.current);
                settleTimer.current = setTimeout(() => {
                  if (!el.isConnected || detailCarousel.current !== el) return;
                  let closest = 0,
                    distance = Infinity;
                  Array.from(el.children).forEach((child, i) => {
                    const box = child as HTMLElement;
                    const d = Math.abs(
                      box.offsetLeft +
                        box.clientWidth / 2 -
                        (el.scrollLeft + el.clientWidth / 2),
                    );
                    if (d < distance) {
                      closest = i;
                      distance = d;
                    }
                  });
                  if (closest !== selectedIndex) moveDetail(closest);
                }, 160);
              }}
            >
              {records.map((record) => (
                <OrderCard
                  key={record.d + record.n}
                  number={record.n}
                  status={statusOf(record)}
                />
              ))}
            </div>
            {records.length > 1 && (
              <OrderControls
                current={selectedIndex}
                total={records.length}
                onChange={moveDetail}
              />
            )}
          </div>
          <div className={styles.detailInfo}>
            <h2>{text[statusOf(current)]}</h2>
            <p>
              {statusOf(current) === 'ready'
                ? text.readyHint
                : statusOf(current) === 'issued'
                  ? text.issuedHint
                  : text.pickup}
            </p>
            <section className={styles.stepsPanel}>
              <Steps stage={statusOf(current)} />
              <p>
                {statusOf(current) === 'issued'
                  ? text.issuedHint
                  : statusOf(current) === 'ready'
                    ? text.readyBody
                    : text.statusHint}
              </p>
            </section>
          </div>
        </div>
        {stateOf(current) === 'notfound' &&
          alertBox(text.notFound, text.questions[2].body)}
        {actions(statusOf(current) === 'issued')}
      </>
    ) : (
      alertBox(text.notFound, text.questions[2].body)
    );
  else if (view === 'list')
    content = (
      <div className={styles.walletList}>
        {records.length === 0 ? (
          <p>{text.emptyOrders}</p>
        ) : (
          records.map((record) => (
            <button
              className={styles.walletRow}
              aria-label={text.order(record.n) + ', ' + text[statusOf(record)]}
              type="button"
              key={record.d + record.n}
              onClick={() => openOrder(record)}
            >
              <span
                className={styles.walletSwatch}
                data-status={statusOf(record)}
              >
                <Icon name="receipt" />
              </span>
              <span>
                <strong>{text.order(record.n)}</strong>
                <span>{text[statusOf(record)]}</span>
              </span>
              <Icon name="arrow-right" />
            </button>
          ))
        )}
        <Button label={text.add} onClick={() => setAdd(true)} />
      </div>
    );
  else if (root === 'board')
    content = (
      <>
        {loading && !board ? (
          <GlassSkeleton />
        ) : failed && !board ? (
          alertBox(text.failedOrders, text.failedHint)
        ) : (
          <>
            {board?.orders.length === 0 ? (
              <div className={styles.empty}>
                <h2>{text.emptyBoard}</h2>
                <p>{text.emptyBoardHint}</p>
              </div>
            ) : (
              <div className={styles.boardGroups}>
                <QueueGroups
                  board={board}
                  mine={(n) => records.some((r) => r.n === n)}
                />
              </div>
            )}
            <p className={styles.legend}>
              {records.length > 0 && (
                <>
                  <span aria-hidden="true" />
                  {text.boardLegend}
                  <br />
                </>
              )}
              {text.automatic}
            </p>
          </>
        )}
      </>
    );
  else if (view === 'faq') {
    const q = text.questions[Number(params.get('topic'))] ?? text.questions[0];
    content = (
      <section className={styles.readPanel}>
        <h2>{q.title}</h2>
        <p>{q.body}</p>
        <Button
          label={
            Number(params.get('topic')) === 0
              ? text.add
              : Number(params.get('topic')) === 1
                ? text.openBoard
                : Number(params.get('topic')) === 2
                  ? text.retryNumber
                  : text.returnHelp
          }
          onClick={() => {
            if (
              Number(params.get('topic')) === 0 ||
              Number(params.get('topic')) === 2
            )
              setAdd(true);
            else
              navigate(
                '/board?view=' +
                  (Number(params.get('topic')) === 1 ? 'queue' : 'help'),
              );
          }}
        />
      </section>
    );
  } else if (view === 'manager')
    content = (
      <>
        <section className={styles.managerPanel}>
          <h2>{text.needManager}</h2>
          <p>{text.managerBody}</p>
          <p>{text.prepareCheck}</p>
        </section>
        <section className={styles.messageInvite}>
          <h2>{text.unavailableManager}</h2>
          <p>{text.canMessage}</p>
          <Button
            label={text.leaveMessage}
            onClick={() => {
              setMessageNumber(current ? String(current.n) : '');
              setSent(false);
              navigate('/board?view=message');
            }}
          />
        </section>
      </>
    );
  else if (view === 'message' && sent)
    content = (
      <section className={styles.readPanel} role="status">
        <h2>{text.messageSent}</h2>
        <p>{text.messageSentHint}</p>
        <Button
          label={text.returnHelp}
          onClick={() => {
            setSent(false);
            navigate('/board?view=help');
          }}
        />
      </section>
    );
  else if (view === 'message')
    content = (
      <form
        className={styles.messageForm + ' ym-hide-content'}
        onSubmit={(event) => {
          event.preventDefault();
          if (sending) return;
          if (!message.trim()) return setMessageError(text.requiredMessage);
          setMessageError('');
          setSending(true);
          // The draft stays until the backend confirms text and every file arrived.
          void sendManagerMessage({
            text: message.trim(),
            number: messageNumber.trim(),
            files: files.map(({ file }) => file),
          }).then((response) => {
            setSending(false);
            if (!response.ok) return setMessageError(text.unavailableSend);
            setMessage('');
            setMessageNumber('');
            setFiles([]);
            setSent(true);
          });
        }}
        noValidate
      >
        <p>{text.messageIntro}</p>
        <Input
          value={messageNumber}
          onValueChange={setMessageNumber}
          label={text.optionalNumber}
          placeholder={text.numberExample}
          showHint={false}
        />
        <Input
          kind="comment"
          value={message}
          onValueChange={(value) => {
            setMessage(value);
            setMessageError('');
          }}
          label={text.happened}
          placeholder={text.describe}
          hint={`${message.length} / 1000`}
          error={
            messageError === text.requiredMessage ? messageError : undefined
          }
        />
        <Attachments files={files} onChange={setFiles} disabled={sending} />
        <p className={styles.anonymous}>{text.anonymous}</p>
        {messageError && messageError !== text.requiredMessage && (
          <p role="alert" className={styles.errorText}>
            {messageError}
          </p>
        )}
        <div className={styles.formAction}>
          <Button
            type="submit"
            label={text.sendMessage}
            state={sending ? 'loading' : 'default'}
          />
        </div>
      </form>
    );
  else if (view === 'notifications')
    content = (
      <>
        <div className={styles.notificationHeading}>
          <p>
            {text.today}
            {unread
              ? ' · ' + events.filter((e) => e.at > readAt).length + ' новых'
              : ''}
          </p>
          <button type="button" onClick={() => setReadAt(now)}>
            {text.markRead}
          </button>
        </div>
        <div className={styles.notifications}>
          {events.length === 0 ? (
            <div className={styles.empty}>
              <h2>{text.emptyNotifications}</h2>
              <p>{text.emptyNotificationsHint}</p>
            </div>
          ) : (
            events.map(({ record, status, at }) => (
              <button
                key={record.d + record.n}
                className={styles.notification}
                data-unread={at > readAt}
                type="button"
                onClick={() => {
                  setReadAt(now);
                  openOrder(record);
                }}
              >
                <span className={styles.notificationIcon} data-status={status}>
                  <Icon name={status === 'preparing' ? 'clock' : 'check'} />
                </span>
                <span>
                  <strong>
                    {status === 'ready'
                      ? text.notificationReady(record.n)
                      : status === 'issued'
                        ? text.notificationIssued(record.n)
                        : text.notificationPreparing(record.n)}
                  </strong>
                  <span>
                    {status === 'ready'
                      ? text.readyBody
                      : status === 'issued'
                        ? text.reviewHint
                        : text.statusHint}
                  </span>
                  <small>
                    {at
                      ? new Date(at).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : text.today}
                  </small>
                </span>
                {at > readAt && <i aria-hidden="true" />}
              </button>
            ))
          )}
        </div>
        <Button
          variant="secondary"
          label={text.notificationSettings}
          onClick={() => setNotificationSettings(true)}
        />
      </>
    );
  else if (root === 'help')
    content = (
      <>
        <p className={styles.intro}>{text.helpIntro}</p>
        <div className={styles.faq}>
          {text.questions.map((q, i) => (
            <Link
              key={q.title}
              data-faq
              data-cursor-label={text.cursorOpen}
              to={'/board?view=faq&topic=' + i}
            >
              <strong className={styles.faqText}>
                <span data-faq-front>{q.title}</span>
                <span
                  data-faq-back
                  className={styles.faqBack}
                  aria-hidden="true"
                >
                  {q.title}
                </span>
              </strong>
              <Icon name="arrow-right" />
            </Link>
          ))}
        </div>
        {actions()}
        <VenueCards />
      </>
    );
  return (
    <div className={styles.shell} data-nested={nested}>
      {nested ? (
        <header className={styles.nestedHeader}>
          <GlassIconButton
            icon="arrow-left"
            label={text.back}
            onClick={() => {
              if (view === 'message' && (message || files.length))
                setDiscard(true);
              else back();
            }}
          />
          <h1 tabIndex={-1}>{title}</h1>
        </header>
      ) : (
        <header className={styles.header}>
          <Link to={orderListHref} aria-label={text.orders}>
            <Logo className={styles.logo} />
          </Link>
          <GlassIconButton
            icon="bell"
            label={text.notifications}
            onClick={() => navigate('/board?view=notifications')}
          >
            {unread && <span className={styles.unread} />}
          </GlassIconButton>
        </header>
      )}
      <main
        ref={main}
        className={styles.main}
        data-root={root}
        data-entry={
          root === 'order' && !nested && (records.length === 0 || typing)
        }
      >
        {motionEnabled && (
          <>
            {' '}
            <MotionEnhancement kind="card" target={main} />
            <MotionEnhancement kind="cursor" target={main} />
          </>
        )}
        {!nested && <h1 tabIndex={-1}>{title}</h1>}
        {offline && (
          <aside className={styles.offline} role="status">
            <strong>{text.offline}</strong>
            <p>{text.offlineHint}</p>
            <button type="button" onClick={retry}>
              {text.retry}
            </button>
          </aside>
        )}
        <ScreenBoundary key={view ?? 'root'} onFailure={telemetry.renderFailed}>
          {content}
        </ScreenBoundary>
      </main>
      {!nested && params.get('rate') !== '1' && <ReviewDock active={root} />}
      <Suspense fallback={null}>
        {add && (
          <AddOrder
            open
            records={records}
            onOpenChange={setAdd}
            onAdded={() => {
              setAdd(false);
              navigate(orderListHref);
            }}
          />
        )}
        {notificationSettings && (
          <Sheet
            open
            onOpenChange={setNotificationSettings}
            title={text.notificationSettings}
            closeButton
          >
            <h3>
              {signals.permission() === 'granted'
                ? text.notificationsOn
                : signals.permission() === 'unsupported'
                  ? text.notificationsUnsupported
                  : text.notificationsOff}
            </h3>
            <p>
              {signals.permission() === 'denied'
                ? text.notificationsBrowser
                : text.notificationsHint}
            </p>
            <Button
              label={text.enableNotifications}
              onClick={() => {
                void signals
                  .requestPermissionFromGesture()
                  .then(() => setPermissionVersion(permissionVersion + 1));
              }}
            />
            <Button
              variant="secondary"
              label={text.understood}
              onClick={() => setNotificationSettings(false)}
            />
          </Sheet>
        )}
        {discard && (
          <Sheet
            open
            onOpenChange={setDiscard}
            title={text.discardTitle}
            closeButton
          >
            <p>{text.discardBody}</p>
            <Button label={text.continue} onClick={() => setDiscard(false)} />
            <Button
              variant="secondary"
              label={text.discard}
              onClick={() => {
                setMessage('');
                setFiles([]);
                setMessageError('');
                setDiscard(false);
                back();
              }}
            />
          </Sheet>
        )}
        {toast !== null && (
          <div role="status" aria-live="polite" className={styles.toast}>
            <Icon name="check-circle" />
            <button
              type="button"
              onClick={() => {
                const record = records.find((r) => r.n === toast);
                if (record) openOrder(record);
                closeToast();
              }}
            >
              <strong>{text.notificationReady(toast)}</strong>
              <span>{text.readyHint}</span>
            </button>
            <GlassIconButton
              icon="close"
              label={text.close}
              onClick={closeToast}
            />
          </div>
        )}
      </Suspense>
      {rating}
    </div>
  );
}
