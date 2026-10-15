import type { Emotion } from '../../content/emotion';
import e1lg from '../../assets/emotion/emotion-1-720.png?format=webp';
import e2lg from '../../assets/emotion/emotion-2-720.png?format=webp';
import e3lg from '../../assets/emotion/emotion-3-720.png?format=webp';
import e4lg from '../../assets/emotion/emotion-4-720.png?format=webp';
import e5lg from '../../assets/emotion/emotion-5-720.png?format=webp';
import e1sm from '../../assets/emotion/emotion-1-180.png?format=webp';
import e2sm from '../../assets/emotion/emotion-2-180.png?format=webp';
import e3sm from '../../assets/emotion/emotion-3-180.png?format=webp';
import e4sm from '../../assets/emotion/emotion-4-180.png?format=webp';
import e5sm from '../../assets/emotion/emotion-5-180.png?format=webp';
import styles from './EmotionCharacter.module.css';

const sources = {
  lg: [e1lg, e2lg, e3lg, e4lg, e5lg],
  sm: [e1sm, e2sm, e3sm, e4sm, e5sm],
};
export function EmotionCharacter({
  emotion,
  size = 'lg',
  alt = '',
}: {
  emotion: Emotion;
  size?: 'lg' | 'sm';
  alt?: string;
}) {
  const dimension = size === 'lg' ? 240 : 72;
  return (
    <img
      className={styles.character}
      src={sources[size][emotion - 1]}
      width={dimension}
      height={dimension}
      alt={alt}
      decoding="async"
      data-size={size}
    />
  );
}
