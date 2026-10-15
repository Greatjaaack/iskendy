import { footerContent } from '../../content/footer';
import { safeMapsHref } from '../Header/Header';
import telegram from '../../assets/footer/telegram.svg?no-inline';
import vk from '../../assets/footer/vk.svg?no-inline';
import instagram from '../../assets/footer/instagram.svg?no-inline';
import styles from './SocialButton.module.css';
export const socialKinds = ['telegram', 'vk', 'instagram'] as const;
export type SocialKind = (typeof socialKinds)[number];
const icons = { telegram, vk, instagram };
export function SocialButton({
  kind,
  href,
}: {
  kind: SocialKind;
  href?: string;
}) {
  const link = safeMapsHref(href);
  if (!link) return null;
  return (
    <a
      className={styles.button}
      data-kind={kind}
      aria-label={footerContent.social[kind]}
      href={link}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img src={icons[kind]} width="24" height="24" alt="" />
      {kind === 'instagram' && (
        <span className={styles.mark} aria-hidden="true">
          *
        </span>
      )}
    </a>
  );
}
