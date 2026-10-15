import { queueContent } from '../../content/queue';
import styles from './QueueChip.module.css';
type Props = {
  number: string;
  status: 'preparing' | 'ready';
  mine?: boolean;
  className?: string;
};
/** Queue item is informational. The Board layout renders the visible 'ваш' caption. */
export function QueueChip({ number, status, mine = false, className }: Props) {
  const label = [number, queueContent[status], mine ? queueContent.mine : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      role="group"
      aria-label={label}
      data-mine={mine}
      className={[styles.chip, styles[status], className]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden="true">{number}</span>
    </div>
  );
}
