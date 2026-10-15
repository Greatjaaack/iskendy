import { spaClick } from '../link/spaClick';
import type { Board } from '../../api/schemas/guest';
import { tileContent } from '../../content/tile';
import go from '../../assets/orders/board-go.svg?no-inline';
import boardIcon from '../../assets/dock/board.svg?no-inline';
import styles from './BoardTile.module.css';
export function BoardTile({
  board,
  onNavigate,
}: {
  board: Board | null;
  onNavigate?: (href: string) => void;
}) {
  const ready = board?.orders.filter(
    (order) => order.status === 'ready',
  ).length;
  const preparing = board ? board.orders.length - ready! : undefined;
  return (
    <a
      href="/board?view=queue"
      onClick={spaClick('/board?view=queue', onNavigate)}
      className={styles.tile}
    >
      <span className={styles.art} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={styles.chip} />
        ))}
        <span className={styles.go}>
          <img src={go} alt="" width="20" height="20" />
        </span>
      </span>
      <span className={styles.text}>
        <strong>
          <img src={boardIcon} alt="" width="22" height="22" />
          {tileContent.board}
        </strong>
        {board && <span>{tileContent.counts(preparing!, ready!)}</span>}
      </span>
    </a>
  );
}
