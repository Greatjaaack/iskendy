import { spaClick } from '../link/spaClick';
import { returnBarContent } from '../../content/return-bar';
import styles from './ReturnBar.module.css';
export function ReturnBar({
  number,
  status,
  ready,
  className,
  onClick,
  onNavigate,
}: {
  number: string;
  status: 'preparing' | 'ready';
  /** Several ready orders (706:33365): «К моим заказам · Готовы: 102, 108». */
  ready?: number[];
  className?: string;
  onClick?: () => void;
  onNavigate?: (href: string) => void;
}) {
  const many = ready && ready.length > 1;
  const label = many ? returnBarContent.many : returnBarContent.label(number);
  const chip = many
    ? returnBarContent.readyMany(ready)
    : returnBarContent[status];
  return (
    <a
      href="/board?my=1"
      onClick={(event) => {
        onClick?.();
        spaClick('/board?my=1', onNavigate)(event);
      }}
      aria-label={label + ' · ' + chip}
      className={[styles.bar, styles[many ? 'ready' : status], className]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden="true" className={styles.chevron} />
      <span className={styles.label}>{label}</span>
      <span className={styles.chip}>{chip}</span>
    </a>
  );
}
