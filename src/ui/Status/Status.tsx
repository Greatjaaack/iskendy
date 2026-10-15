import { statusContent } from '../../content/status';
import styles from './Status.module.css';
export type StatusKind = keyof typeof statusContent;
export function Status({
  status = 'preparing',
  className,
}: {
  status?: StatusKind;
  className?: string;
}) {
  const content = statusContent[status];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[styles.status, styles[status], className]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden="true">{content.symbol}</span>
      <span>{content.label}</span>
    </div>
  );
}
