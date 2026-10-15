import { QueueChip } from './QueueChip';
import styles from './QueueChip.stories.module.css';
export default function QueueChipStories() {
  return (
    <div data-testid="queue-figma" className={styles.frame}>
      {(['preparing', 'ready'] as const).flatMap((status) =>
        [false, true].map((mine) => (
          <QueueChip
            key={status + mine}
            number="112"
            status={status}
            mine={mine}
          />
        )),
      )}
    </div>
  );
}
