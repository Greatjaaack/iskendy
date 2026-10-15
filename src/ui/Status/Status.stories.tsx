import { Status } from './Status';
import styles from './Status.stories.module.css';
export default function StatusStories() {
  return (
    <div data-testid="status-figma" className={styles.frame}>
      {(['preparing', 'ready', 'not-found', 'offline'] as const).map(
        (status) => (
          <Status key={status} status={status} />
        ),
      )}
    </div>
  );
}
