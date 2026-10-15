import { Logo } from './Logo';
import { Rosette } from './Rosette';
import styles from './Brand.stories.module.css';
export default function BrandStories() {
  return (
    <>
      <div data-testid="logo-figma-pair" className={styles.pair}>
        <Logo />
        <Logo tone="on-dark" />
      </div>
      <div data-testid="rosette-figma">
        <Rosette />
      </div>
    </>
  );
}
