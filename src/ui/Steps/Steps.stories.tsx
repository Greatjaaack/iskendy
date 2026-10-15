import { Steps } from './Steps';
import styles from './Steps.stories.module.css';
export default function StepsStories() {
  return (
    <div data-testid="steps-figma" className={styles.frame}>
      <Steps />
      <Steps stage="ready" />
      <Steps stage="issued" />
    </div>
  );
}
