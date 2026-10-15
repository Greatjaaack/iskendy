import { useEffect } from 'react';
import { readyToastContent as text } from '../../content/ready-toast';
import styles from './ReadyToast.module.css';
/** Web/ReadyToast 664:23495: another order is ready. 5 s, no motion (ADR-018),
 * never shifts the layout; tap opens the order, «×» closes earlier. */
export function ReadyToast({
  number,
  onOpen,
  onClose,
}: {
  number: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [number, onClose]);
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <button type="button" className={styles.open} onClick={onOpen}>
        <span aria-hidden="true" className={styles.check} />
        {text.title(number)}
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label={text.close}
        onClick={onClose}
      >
        <span aria-hidden="true" className={styles.cross} />
      </button>
    </div>
  );
}
