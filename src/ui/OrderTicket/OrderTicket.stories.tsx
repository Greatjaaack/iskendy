import { OrderTicket } from './OrderTicket';
import styles from './OrderTicket.stories.module.css';
export default function OrderTicketStories() {
  return (
    <div data-testid="ticket-figma" className={styles.frame}>
      {(['mobile', 'desktop'] as const).flatMap((size) =>
        (['preparing', 'ready', 'issued'] as const).map((status) => (
          <div
            key={size + status}
            data-testid={size + '-' + status}
            className={styles[size + '-' + status]}
          >
            <OrderTicket number="112" status={status} size={size} />
          </div>
        )),
      )}
    </div>
  );
}
