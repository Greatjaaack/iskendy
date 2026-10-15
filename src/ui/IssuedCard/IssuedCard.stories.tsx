import { IssuedCard } from './IssuedCard';
import styles from './IssuedCard.stories.module.css';
export default function IssuedCardStories() {
  return (
    <div data-testid="issued-card-kit">
      <div className={styles.mobile}>
        <IssuedCard number={112} onRate={() => {}} />
      </div>
      <div className={styles.desktop}>
        <IssuedCard number={112} desktop onRate={() => {}} />
      </div>
    </div>
  );
}
