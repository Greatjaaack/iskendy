import { footerContent } from '../../content/footer';
import { InfoCard } from '../InfoCard/InfoCard';
import { SocialButton, socialKinds } from '../SocialButton/SocialButton';
import { Logo } from '../Brand/Logo';
import { safeMapsHref } from '../Header/Header';
import styles from './Footer.module.css';
import { Ticker } from '../Ticker/Ticker';
export type FooterLinks = {
  yandex?: string;
  telegram?: string;
  vk?: string;
  instagram?: string;
};
/** Static author Ticker; mobile footer is the Help screen only. */
export function Footer({
  desktop = false,
  links = {},
}: {
  desktop?: boolean;
  links?: FooterLinks;
}) {
  return (
    <footer
      className={styles.footer}
      data-size={desktop ? 'desktop' : 'mobile'}
      data-testid="guest-footer"
    >
      <Ticker />
      <div className={styles.cards}>
        <InfoCard kind="address" href={links.yandex} />
        <InfoCard kind="hours" />
        {safeMapsHref(links.telegram) && (
          <InfoCard kind="telegram" href={links.telegram} />
        )}
      </div>
      <div className={styles.brandSocial}>
        {desktop && <Logo className={styles.logo} />}
        <div className={styles.socials}>
          {socialKinds.map((kind) => (
            <SocialButton key={kind} kind={kind} href={links[kind]} />
          ))}
        </div>
      </div>
      <p className={styles.legal}>{footerContent.legal}</p>
    </footer>
  );
}
