import { ReturnBar } from './ReturnBar';
import styles from './ReturnBar.stories.module.css';
export default function ReturnBarStories() {
  return (
    <div data-testid="return-figma" className={styles.frame}>
      <ReturnBar number="112" status="preparing" />
      <ReturnBar number="112" status="ready" />
    </div>
  );
}
