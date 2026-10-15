import { ticketContent } from '../../content/order-ticket';
import { Steps } from '../Steps/Steps';
import type { OrderStage } from '../Steps/Steps';
import preparingMobile from '../../assets/order-ticket/ornament-preparing-mobile.svg?no-inline';
import readyMobile from '../../assets/order-ticket/ornament-ready-mobile.svg?no-inline';
import issuedMobile from '../../assets/order-ticket/ornament-issued-mobile.svg?no-inline';
import preparingDesktop from '../../assets/order-ticket/ornament-preparing-desktop.svg?no-inline';
import readyDesktop from '../../assets/order-ticket/ornament-ready-desktop.svg?no-inline';
import issuedDesktop from '../../assets/order-ticket/ornament-issued-desktop.svg?no-inline';
import preparingStar from '../../assets/order-ticket/ornament-preparing-desktop-star.svg?no-inline';
import readyStar from '../../assets/order-ticket/ornament-ready-desktop-star.svg?no-inline';
import issuedStar from '../../assets/order-ticket/ornament-issued-desktop-star.svg?no-inline';
import styles from './OrderTicket.module.css';
// 684:25675 (T1024): the «⋯» corner button replaces the ornament's circle.
const stars = {
  preparing: preparingStar,
  ready: readyStar,
  issued: issuedStar,
};
const ornaments = {
  mobile: {
    preparing: preparingMobile,
    ready: readyMobile,
    issued: issuedMobile,
  },
  desktop: {
    preparing: preparingDesktop,
    ready: readyDesktop,
    issued: issuedDesktop,
  },
};
type Props = {
  number: string;
  status: OrderStage;
  size?: 'mobile' | 'desktop';
  pickup?: string;
  className?: string;
  pending?: boolean;
  /** true: page h1; 2: card h2 under «Мои заказы». */
  heading?: boolean | 2;
  /** «⋯» sits on the ticket corner (Мои заказы ≥ 768). */
  cornerAction?: boolean;
  /** Replaces the cooking description (platform hint, UX-14). */
  note?: string;
};
export function OrderTicket({
  number,
  status,
  size = 'mobile',
  pickup = ticketContent.pickup,
  className,
  pending = false,
  heading = false,
  cornerAction = false,
  note,
}: Props) {
  // 664:23544: while cooking the ticket says what to do (UX-14); iPhone text by default.
  const description =
    status === 'preparing'
      ? (note ?? ticketContent.hint.unsupported)
      : ticketContent[status];
  return (
    <article
      aria-label={ticketContent.label + ' ' + number}
      data-status={status}
      data-size={size}
      className={[styles.ticket, className].filter(Boolean).join(' ')}
    >
      <picture>
        {cornerAction && (
          <source
            media="(min-width: 1024px) and (max-width: 1439px)" /* figma: 684:25675 */
            srcSet={stars[status]}
          />
        )}
        <img
          className={styles.ornament}
          src={ornaments[size][status]}
          alt=""
          aria-hidden="true"
        />
      </picture>
      {heading === 2 ? (
        <h2 className={styles.caption} tabIndex={-1}>
          {ticketContent.label}
        </h2>
      ) : heading ? (
        <h1 className={styles.caption} tabIndex={-1}>
          {ticketContent.label}
        </h1>
      ) : (
        <p className={styles.caption}>{ticketContent.label}</p>
      )}
      <p className={styles.number}>{number}</p>
      {status !== 'preparing' && (
        <p className={styles.accent}>
          {status === 'ready'
            ? ticketContent.readyTitle
            : ticketContent.issuedTitle}
        </p>
      )}
      <p className={styles.description}>
        {pending ? ticketContent.pending : description}
      </p>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <span
            aria-hidden="true"
            className={[
              styles.icon,
              status === 'preparing' ? styles.clock : styles.check,
            ].join(' ')}
          />
          <div className={styles.factText}>
            <dt>{ticketContent.statusLabel}</dt>
            <dd role="status" aria-live="polite" aria-atomic="true">
              {pending ? ticketContent.pending : ticketContent.states[status]}
            </dd>
          </div>
        </div>
        <div className={styles.fact}>
          <span
            aria-hidden="true"
            className={[styles.icon, styles.pin].join(' ')}
          />
          <div className={styles.factText}>
            <dt>{ticketContent.pickupLabel}</dt>
            <dd>{pickup}</dd>
          </div>
        </div>
      </dl>
      <Steps
        stage={status}
        issuedTone={status === 'issued'}
        className={styles.steps}
      />
    </article>
  );
}
