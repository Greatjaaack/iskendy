import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from 'react';
import { Link, navigate } from '../../app/router';
import { useNavigationVisibility } from '../../app/navigation-visibility';
import { orderListHref } from '../../domain/order/routes';
import { reviewContent as text } from '../../content/review';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';
import { Icon, type IconName } from '../Icon/Icon';
import tulip from '../../assets/review/tulip.svg';
import tulipMini from '../../assets/review/tulip-mini.svg';
import rosette from '../../assets/review/rosette.svg';
import rosetteLines from '../../assets/review/rosette-lines.svg';
import nazar from '../../assets/review/nazar.svg';
import nazarLines from '../../assets/review/nazar-lines.svg';
import boardArt from '../../assets/review/board.svg';
import gameArt from '../../assets/review/game.svg';
import managerArt from '../../assets/review/manager.svg';
import reviewArt from '../../assets/review/review.svg';
import ordersIcon from '../../assets/review/dock-orders.svg';
import boardIcon from '../../assets/review/dock-board.svg';
import helpIcon from '../../assets/review/dock-help.svg';
import boardActive from '../../assets/review/dock-board-active.svg';
import helpActive from '../../assets/review/dock-help-active.svg';
import styles from './ReviewUI.module.css';

export type ReviewStatus = 'preparing' | 'ready' | 'issued';
export function GlassIconButton({
  icon,
  label,
  onClick,
  children,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  const target = useRef<HTMLButtonElement>(null);
  const enabled = useMotionEnabled();
  return (
    <button
      type="button"
      className={styles.iconButton}
      ref={target}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} />
      {children}
      {enabled && <MotionEnhancement kind="control" target={target} />}
    </button>
  );
}
export function OrderArtwork({
  status,
  mini = false,
}: {
  status: ReviewStatus;
  mini?: boolean;
}) {
  return (
    <span className={styles.ornament} data-mini={mini} aria-hidden="true">
      <img
        src={
          status === 'preparing'
            ? mini
              ? tulipMini
              : tulip
            : status === 'ready'
              ? rosette
              : nazar
        }
        alt=""
      />
      {status !== 'preparing' && (
        <img
          className={styles.ornamentCenter}
          src={status === 'ready' ? rosetteLines : nazarLines}
          alt=""
        />
      )}
    </span>
  );
}
export function OrderCard({
  number,
  status,
  narrow = false,
  onClick,
  pending = false,
}: {
  number: number;
  status: ReviewStatus;
  narrow?: boolean;
  onClick?: () => void;
  pending?: boolean;
}) {
  const body = (
    <>
      <OrderArtwork status={status} mini={narrow} />
      <span className={styles.cardLabel}>{text.yourOrder}</span>
      <strong className={styles.orderNumber} data-long={number > 999}>
        {number}
      </strong>
      <span
        className={styles.cardStatus}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Icon name={status === 'preparing' ? 'clock' : 'check'} />
        {pending ? text.pending : text[status]}
      </span>
      <span className={styles.cardHint}>
        {status === 'preparing'
          ? text.pickup
          : status === 'ready'
            ? text.readyHint
            : text.issuedHint}
      </span>
    </>
  );
  return onClick ? (
    <article
      className={styles.cardRoot}
      data-card-root
      aria-label={text.yourOrder + ' ' + number}
    >
      <button
        type="button"
        className={styles.orderCard}
        data-hover-card
        data-cursor-label={text.cursorOpen}
        data-cursor-tone={status === 'issued' ? 'contrast' : undefined}
        data-status={status}
        data-narrow={narrow}
        onClick={onClick}
        aria-label={text.order(number) + ', ' + text[status]}
      >
        {body}
      </button>
    </article>
  ) : (
    <article
      className={styles.orderCard}
      data-status={status}
      data-narrow={narrow}
      aria-label={text.yourOrder + ' ' + number}
    >
      {body}
    </article>
  );
}
export function IllustratedAction({
  kind,
  title,
  hint,
  onClick,
}: {
  kind: 'board' | 'game' | 'manager' | 'review';
  title?: string;
  hint?: string;
  onClick?: () => void;
}) {
  const names = {
    board: text.allBoard,
    game: text.game,
    manager: text.manager,
    review: text.review,
  };
  const illustration = (
    <span className={styles.actionArt}>
      <img
        src={
          {
            board: boardArt,
            game: gameArt,
            manager: managerArt,
            review: reviewArt,
          }[kind]
        }
        alt=""
      />
    </span>
  );
  const content = (
    <>
      {illustration}
      <span className={styles.actionCopy}>
        <strong>{title ?? names[kind]}</strong>
        <span>
          {hint ??
            (kind === 'game'
              ? text.soon
              : kind === 'manager'
                ? text.managerHint
                : text.reviewHint)}
        </span>
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={styles.illustratedAction}
      data-hover-card
      data-cursor-label={text.cursorGo}
      data-cursor-tone={kind === 'manager' ? 'contrast' : undefined}
      aria-label={title ?? names[kind]}
      data-rating-trigger={kind === 'review' ? true : undefined}
      data-kind={kind}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <article
      className={styles.illustratedAction}
      data-kind={kind}
      aria-label={names[kind] + ' — ' + text.soon}
    >
      {content}
    </article>
  );
}
export function OrderControls({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (index: number) => void;
}) {
  const previous = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const enabled = useMotionEnabled();
  return (
    <div
      className={styles.orderControls}
      role="group"
      aria-label={text.orderControls}
    >
      <button
        type="button"
        ref={previous}
        disabled={current <= 0}
        aria-label={text.previousOrder}
        onClick={() => onChange(current - 1)}
      >
        <Icon name="arrow-left" />
        {enabled && <MotionEnhancement kind="control" target={previous} />}
      </button>
      <span aria-live="polite" aria-atomic="true">
        {text.orderPosition(current + 1, total)}
      </span>
      <button
        type="button"
        ref={next}
        disabled={current >= total - 1}
        aria-label={text.nextOrder}
        onClick={() => onChange(current + 1)}
      >
        <Icon name="arrow-right" />
        {enabled && <MotionEnhancement kind="control" target={next} />}
      </button>
    </div>
  );
}
export function CarouselIndicator({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange?: (index: number) => void;
}) {
  return (
    <div
      className={styles.indicator}
      role="group"
      aria-label={text.carousel(current + 1, total)}
    >
      {Array.from({ length: total }, (_, i) => (
        <button
          type="button"
          key={i}
          aria-label={text.carousel(i + 1, total)}
          aria-current={i === current ? 'true' : undefined}
          onClick={() => onChange?.(i)}
        >
          <span />
        </button>
      ))}
    </div>
  );
}
const tabs = [
  { key: 'order', label: text.orders, to: orderListHref, icon: ordersIcon },
  { key: 'board', label: text.board, to: '/board?view=queue', icon: boardIcon },
  { key: 'help', label: text.help, to: '/board?view=help', icon: helpIcon },
] as const;
/** Capture the pointer on the whole dock: a held lens follows continuously, release commits once. */
export function ReviewDock({ active }: { active: 'order' | 'board' | 'help' }) {
  const nav = useRef<HTMLElement>(null),
    gesture = useRef({
      x: 0,
      moved: false,
      index: 0,
      held: false,
      timer: 0,
      pointer: null as number | null,
    }),
    suppress = useRef(false);
  const [held, setHeld] = useState(false);
  const visibility = useNavigationVisibility();
  const cancelGesture = useCallback(() => {
    const pointer = gesture.current.pointer;
    window.clearTimeout(gesture.current.timer);
    // Clear ownership before release: lostpointercapture may fire synchronously.
    gesture.current.pointer = null;
    gesture.current.held = false;
    gesture.current.timer = 0;
    if (pointer !== null) {
      suppress.current = true;
      if (nav.current?.hasPointerCapture?.(pointer))
        nav.current.releasePointerCapture(pointer);
    }
    setHeld(false);
  }, []);
  useEffect(() => {
    window.addEventListener('blur', cancelGesture);
    window.addEventListener('pagehide', cancelGesture);
    const visibility = () => {
      if (document.visibilityState !== 'visible') cancelGesture();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(gesture.current.timer);
      window.removeEventListener('blur', cancelGesture);
      window.removeEventListener('pagehide', cancelGesture);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cancelGesture]);
  const update = (event: PointerEvent<HTMLElement>) => {
    const el = nav.current;
    if (!el) return;
    const bounds = el.getBoundingClientRect();
    if (!bounds.width) return;
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    gesture.current.index = Math.min(2, Math.floor(x / (bounds.width / 3)));
    el.style.setProperty('--review-dock-lens-x', x + 'px');
    if (Math.abs(event.clientX - gesture.current.x) > 6) {
      gesture.current.moved = true;
      gesture.current.held = true;
      setHeld(true);
    }
  };
  const end = (event: PointerEvent<HTMLElement>, cancel = false) => {
    if (gesture.current.pointer !== event.pointerId) return;
    const destination = tabs[gesture.current.index]?.to ?? orderListHref;
    cancelGesture();
    if (!cancel) navigate(destination);
  };
  return (
    <nav
      ref={nav}
      className={styles.dock}
      data-guest-navigation
      data-held={held}
      data-visibility={visibility}
      aria-label={text.navigationLabel}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => {
        // On touch this is a held segmented control, not a link preview.
        if (window.matchMedia('(pointer: coarse)').matches)
          event.preventDefault();
        cancelGesture();
      }}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          gesture.current.pointer !== null
        )
          return;
        suppress.current = false;
        gesture.current = {
          x: event.clientX,
          moved: false,
          index: Math.max(
            0,
            tabs.findIndex(
              (tab) =>
                tab.to ===
                (event.target as Element).closest('a')?.getAttribute('href'),
            ),
          ),
          held: false,
          timer: 0,
          pointer: event.pointerId,
        };
        update(event);
        nav.current?.setPointerCapture?.(event.pointerId);
        gesture.current.timer = window.setTimeout(() => {
          gesture.current.held = true;
          setHeld(true);
        }, 160);
      }}
      onPointerMove={(event) => {
        if (gesture.current.pointer === event.pointerId) update(event);
      }}
      onPointerUp={(event) => end(event)}
      onPointerCancel={(event) => end(event, true)}
      onLostPointerCapture={(event) => end(event, true)}
      onClickCapture={(event) => {
        if (suppress.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppress.current = false;
        }
      }}
    >
      <span className={styles.focusLens} aria-hidden="true" />
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          className={styles.dockTab}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          <img
            src={
              active === tab.key
                ? tab.key === 'board'
                  ? boardActive
                  : tab.key === 'help'
                    ? helpActive
                    : tab.icon
                : tab.icon
            }
            width="24"
            height="24"
            alt=""
          />
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
export function GlassSkeleton() {
  return (
    <div
      className={styles.skeleton}
      aria-busy="true"
      role="status"
      aria-label={text.loading}
    >
      <div className={styles.skeletonCard}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.skeletonActions}>
        <span />
        <span />
      </div>
    </div>
  );
}
