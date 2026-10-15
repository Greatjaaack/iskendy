import { ticketContent } from '../../content/order-ticket';
import styles from './Steps.module.css';
export type OrderStage = 'preparing' | 'ready' | 'issued';
export const stageIndex = { preparing: 1, ready: 2, issued: 3 } as const;
export function Steps({
  stage = 'preparing',
  issuedTone = false,
  className,
}: {
  stage?: OrderStage;
  issuedTone?: boolean;
  className?: string;
}) {
  const current = stageIndex[stage];
  return (
    <ol
      className={[styles.steps, issuedTone ? styles.issued : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {ticketContent.steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          data-complete={index <= current}
          className={styles.step}
        >
          <span aria-hidden="true" className={styles.bar} />
          <span className={styles.label}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
