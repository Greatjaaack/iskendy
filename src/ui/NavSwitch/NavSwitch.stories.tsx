import { NavSwitch } from './NavSwitch';
import styles from './NavSwitch.stories.module.css';
export default function NavSwitchStories() {
  return (
    <div data-testid="nav-figma" className={styles.frame}>
      <NavSwitch active="order" number="112" />
      <NavSwitch active="board" number="112" />
      <NavSwitch active="order" />
      <NavSwitch active="board" />
      <NavSwitch active="none" number="112" />
      <NavSwitch active="help" number="112" />
      <NavSwitch active="help" />
    </div>
  );
}
