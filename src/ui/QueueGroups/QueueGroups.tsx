import type { Board } from '../../api/schemas/guest';
import { entryContent as text } from '../../content/entry';
import { QueueChip } from '../QueueChip/QueueChip';
import styles from './QueueGroups.module.css';
/** «Готовим» / «Готово» groups of the board; own numbers framed «ваш». */
export function QueueGroups({
  board,
  mine,
  aside = false,
}: {
  board: Board | null;
  mine: (number: number) => boolean;
  aside?: boolean;
}) {
  return (
    <>
      {(['preparing', 'ready'] as const).map((group) => (
        <section
          key={group}
          className={[styles.group, styles[group], aside ? styles.aside : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className={styles.heading}>
            <h2>{text[group]}</h2>
            {group === 'ready' && (
              <span className={styles.pickup}>{text.pickup}</span>
            )}
          </div>
          <div className={styles.chips} aria-busy={!board}>
            {board?.orders
              .filter((item) =>
                group === 'ready'
                  ? item.status === 'ready'
                  : item.status !== 'ready',
              )
              .map((item) => (
                <QueueChip
                  key={item.number}
                  number={String(item.number)}
                  status={group}
                  mine={mine(item.number)}
                />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
