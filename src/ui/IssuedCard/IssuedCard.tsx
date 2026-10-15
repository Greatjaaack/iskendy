import { issuedContent as text } from '../../content/issued';
import { ticketContent } from '../../content/order-ticket';
import { emotions, type Emotion } from '../../content/emotion';
import { ratingContent } from '../../content/rating';
import { EmotionCharacter } from '../EmotionCharacter/EmotionCharacter';
import { Button } from '../Button/Button';
import styles from './IssuedCard.module.css';
export function IssuedCard({
  number,
  desktop = false,
  onRate,
}: {
  number: number;
  desktop?: boolean;
  /** With an emotion: a face was tapped (681:24758, UX-16). */
  onRate: (emotion?: Emotion) => void;
}) {
  const Container = desktop ? 'article' : 'section';
  const Heading = desktop ? 'h1' : 'h2';
  return (
    <Container
      className={styles.card}
      data-size={desktop ? 'desktop' : 'mobile'}
      data-testid="issued-card"
      aria-label={desktop ? `${ticketContent.label} ${number}` : text.question}
    >
      {desktop && (
        <>
          <p className={styles.status} role="status" aria-live="polite">
            {text.status(number)}
          </p>
          <p className={styles.appetite}>{text.appetite}</p>
        </>
      )}
      <Heading className={styles.question} tabIndex={desktop ? -1 : undefined}>
        {text.question}
      </Heading>
      <div className={styles.emotions} role="group" aria-label={text.question}>
        {emotions.map((emotion) => (
          <button
            type="button"
            className={styles.emotion}
            key={emotion}
            aria-label={ratingContent.names[emotion - 1]}
            onClick={() => onRate(emotion)}
          >
            <EmotionCharacter emotion={emotion} size="sm" />
          </button>
        ))}
      </div>
      <p className={styles.invitation}>{text.invitation}</p>
      <Button
        label={text.rate}
        className={styles.rate}
        data-rating-trigger
        onClick={() => onRate()}
      />
    </Container>
  );
}
