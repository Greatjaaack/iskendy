import type { StripStatus } from '../../domain/order/stack';
import { ordersContent as text } from '../../content/orders';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './OrderStrip.module.css';

const icons: Record<StripStatus, IconName> = {
  preparing: 'clock',
  ready: 'check-circle',
  waiting: 'hourglass',
  notfound: 'alert-circle',
  issued: 'seal-check',
  rated: 'seal-check',
};
/** Web/OrderStrip 664:23494: one tappable strip of the «Мои заказы» stack. */
export function OrderStrip({
  number,
  status,
  onSelect,
}: {
  number: number;
  status: StripStatus;
  onSelect: () => void;
}) {
  const word = text.strip[status];
  return (
    <button
      type="button"
      className={styles.strip}
      data-status={status}
      aria-label={text.stripLabel(number, word)}
      onClick={onSelect}
    >
      <span className={styles.number}>{text.number(number)}</span>
      <span className={styles.status}>
        <Icon name={icons[status]} className={styles.icon} />
        {word}
      </span>
    </button>
  );
}
/** Web/OrderStrip status=completed: folds issued and rated orders. */
export function CompletedStrip({
  count,
  expanded,
  onToggle,
  controls,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      className={styles.strip}
      data-status="completed"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className={styles.label}>{text.completed(count)}</span>
      <Icon
        name="chevron-down"
        className={[styles.icon, expanded ? styles.up : ''].join(' ')}
      />
    </button>
  );
}
