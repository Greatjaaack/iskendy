import { Footer } from './Footer';
import { InfoCard, infoCardKinds } from '../InfoCard/InfoCard';
import styles from './Footer.stories.module.css';
const links = {
  yandex: 'https://example.test/yandex',
  telegram: 'https://example.test/telegram',
  vk: 'https://example.test/vk',
  instagram: 'https://example.test/instagram',
};
export default function FooterStories() {
  return (
    <div>
      <div className={styles.mobile} data-testid="footer-mobile-kit">
        <Footer links={links} />
      </div>
      <div className={styles.desktop} data-testid="footer-desktop-kit">
        <Footer desktop links={links} />
      </div>
      <div className={styles.variants} data-testid="info-card-kit">
        {infoCardKinds.map((kind) => (
          <div className={styles.mobile} key={kind}>
            <InfoCard kind={kind} href="https://example.test/destination" />
          </div>
        ))}
      </div>
    </div>
  );
}
