import { gameTileContent as copy } from '../../content/game-tile';
import petals from '../../assets/game-tile/petals.svg?no-inline';
import vector from '../../assets/game-tile/vector.svg?no-inline';
import play from '../../assets/game-tile/play.svg?no-inline';
import styles from './GameTile.module.css';
/** Owner-approved static placeholder, deliberately without link, handler or tab stop. */
export function GameTile() {
  return (
    <article
      className={styles.tile}
      aria-label={`${copy.title} — ${copy.soon}`}
      data-testid="game-tile"
    >
      <div className={styles.art} aria-hidden="true">
        {[0, 1].map((i) => (
          <span key={i} className={styles.motif}>
            <img
              className={styles.petals}
              src={petals}
              width="90"
              height="90"
              alt=""
            />
            <img
              className={styles.vector}
              src={vector}
              width="34"
              height="60"
              alt=""
            />
            <img
              className={styles.vector}
              src={vector}
              width="34"
              height="60"
              alt=""
            />
          </span>
        ))}
      </div>
      <div className={styles.text}>
        <strong>
          <img src={play} width="22" height="22" alt="" />
          {copy.title}
        </strong>
        <span>{copy.soon}</span>
      </div>
    </article>
  );
}
