import { useRef } from 'react';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';
import { Link } from '../../app/router';
import { useNavigationVisibility } from '../../app/navigation-visibility';
import { navigationContent } from '../../content/navigation';
import { entryContent } from '../../content/entry';
import type { Section } from '../NavSwitch/NavSwitch';
import styles from './Dock.module.css';
import { orderListHref } from '../../domain/order/routes';
import { ordersContent } from '../../content/orders';
import ring from '../../assets/dock/ring.svg?no-inline';
import preparing from '../../assets/dock/ring-preparing.svg?no-inline';
import ready from '../../assets/dock/ring-ready.svg?no-inline';
import issued from '../../assets/dock/ring-issued.svg?no-inline';
type Props = {
  active: Section;
  collection?: boolean;
  backToOrders?: boolean;
  number?: string;
  status?: 'preparing' | 'ready' | 'issued';
  /** Q-14: no «Табло» tab before the guest has an order. */
  board?: boolean;
  /** UX-15: some order is ready — olive check on «Мои заказы» (706:33398). */
  ready?: boolean;
};
export function Dock({
  active,
  number,
  status = 'preparing',
  collection = false,
  backToOrders = false,
  board = true,
  ready: readyBadge = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const enabled = useMotionEnabled(collection);
  const visibility = useNavigationVisibility();
  if (collection)
    return (
      <div
        ref={host}
        className={styles.compactDock}
        data-guest-navigation
        data-visibility={visibility}
      >
        <div ref={panel} className={styles.motionPanel}>
          {backToOrders && (
            <Link
              to={orderListHref}
              className={styles.back}
              aria-label={ordersContent.title}
            >
              <span aria-hidden="true" />
            </Link>
          )}
          <nav
            className={styles.collection}
            aria-label={navigationContent.label}
          >
            {(board
              ? (['order', 'board', 'help'] as const)
              : (['order', 'help'] as const)
            ).map((section) => (
              <Link
                key={section}
                to={
                  section === 'order'
                    ? orderListHref
                    : '/board?view=' + (section === 'board' ? 'queue' : 'help')
                }
                className={styles.tab}
                aria-current={active === section ? 'page' : undefined}
                aria-label={
                  section === 'order' && readyBadge
                    ? ordersContent.title + ', ' + entryContent.dockStates.ready
                    : undefined
                }
              >
                {section === 'order' ? (
                  <>
                    <span className={styles.receipt} aria-hidden="true" />
                    {readyBadge && (
                      <span className={styles.ready} aria-hidden="true" />
                    )}
                  </>
                ) : (
                  <span
                    aria-hidden="true"
                    className={[styles.icon, styles[section]].join(' ')}
                  />
                )}
                <span>
                  {section === 'order'
                    ? ordersContent.title
                    : navigationContent[section]}
                </span>
              </Link>
            ))}
          </nav>
        </div>
        {enabled && (
          <MotionEnhancement
            kind="dock"
            target={panel}
            host={host}
            value={visibility}
          />
        )}
      </div>
    );
  const progress = { preparing, ready, issued }[status];
  return (
    <nav className={styles.dock} aria-label={navigationContent.label}>
      {(['board', 'help'] as const).map((section) => (
        <Link
          key={section}
          to={`/board?view=${section === 'board' ? 'queue' : 'help'}`}
          className={styles.tab}
          aria-current={active === section ? 'page' : undefined}
        >
          <span
            aria-hidden="true"
            className={[
              styles.icon,
              styles[section],
              active === section ? styles[section + 'Solid'] : '',
            ].join(' ')}
          />
          <span>{navigationContent[section]}</span>
        </Link>
      ))}
      <Link
        className={styles.order}
        to={number ? '/board?my=1' : '/'}
        aria-current={active === 'order' ? 'page' : undefined}
        aria-label={
          number
            ? entryContent.myOrder +
              ' ' +
              number +
              ' · ' +
              entryContent.dockStates[status]
            : navigationContent.noOrder
        }
      >
        {number && (
          <>
            <img src={ring} alt="" className={styles.ring} />
            <span
              className={[
                styles.progress,
                status === 'preparing' ? styles.half : '',
              ].join(' ')}
            >
              <img src={progress} alt="" />
            </span>
          </>
        )}
        <span className={styles.orderLabel}>
          {number ? (
            <span className={styles.number}>{number}</span>
          ) : (
            <span aria-hidden="true" className={styles.hash} />
          )}
          <span>
            {number ? entryContent.dockStates[status] : entryContent.myOrder}
          </span>
        </span>
      </Link>
    </nav>
  );
}
