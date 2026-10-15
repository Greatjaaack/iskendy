import type { ReactNode } from 'react';
import { offlineContent as text } from '../../content/offline';
import loader from '../../assets/button/loader.svg?no-inline';
import rosette from '../../assets/brand/rosette.svg?no-inline';
import styles from './Offline.module.css';
/** «Связь пропала» on «Мои заказы» (Q-01): statuses that may have changed are hidden;
 * a ticket that was «Готово» stays, since it cannot stop being ready. */
export function OfflineOrders({
  cooking,
  ready,
  wide,
}: {
  cooking: number[];
  ready: ReactNode;
  wide: boolean;
}) {
  return (
    <main className={styles.layout}>
      <div className={styles.offline}>
        <h1 tabIndex={-1}>{text.title}</h1>
        <p className={styles.body}>{text.body(cooking, Boolean(ready))}</p>
        <p role="status" className={styles.restoring}>
          <img src={loader} alt="" width="24" height="24" />
          {text.restoring}
        </p>
        <p className={styles.auto}>{text.auto}</p>
        {ready}
      </div>
      {wide && <OfflineBoard />}
    </main>
  );
}
/** 565:26049: the board waits for the connection instead of showing stale numbers. */
export function OfflineBoard() {
  return (
    <section className={styles.board}>
      <img src={rosette} alt="" width="64" height="65" />
      <p>{text.board}</p>
    </section>
  );
}
