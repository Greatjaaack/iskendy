import { Icon, iconNames } from './Icon';
import styles from './Icon.stories.module.css';
export default function IconStories() {
  return (
    <div data-testid="icon-figma-strip" className={styles.strip}>
      {iconNames.map((name) => (
        <Icon key={name} name={name} label={name} />
      ))}
    </div>
  );
}
