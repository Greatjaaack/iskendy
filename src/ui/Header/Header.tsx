import { Link } from '../../app/router';
import { Logo } from '../Brand/Logo';
import { Icon } from '../Icon/Icon';
import { NavSwitch } from '../NavSwitch/NavSwitch';
import type { Section } from '../NavSwitch/NavSwitch';
import { headerContent } from '../../content/header';
import styles from './Header.module.css';
export function safeMapsHref(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return;
  }
}
export function HeaderMobile({
  mapsHref,
  className,
}: {
  mapsHref?: string;
  className?: string;
}) {
  const href = safeMapsHref(mapsHref);
  return (
    <header className={[styles.mobile, className].filter(Boolean).join(' ')}>
      <Link to="/" className={styles.logoLink}>
        <Logo className={styles.mobileLogo} />
      </Link>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.maps}
          aria-label={headerContent.mapsLabel}
        >
          <Icon name="pin" />
        </a>
      )}
    </header>
  );
}
type DesktopProps = (
  { active: 'none'; number: string } | { active: Section; number?: string }
) & { className?: string; collection?: boolean; board?: boolean };
export function HeaderDesktop({
  active,
  number,
  className,
  collection = false,
  board = true,
}: DesktopProps) {
  const navigation =
    active === 'none' ? (
      <NavSwitch
        active="none"
        number={number!}
        collection={collection}
        board={board}
      />
    ) : (
      <NavSwitch
        active={active}
        number={number}
        collection={collection}
        board={board}
      />
    );
  return (
    <header className={[styles.desktop, className].filter(Boolean).join(' ')}>
      <Link to="/" className={styles.logoLink}>
        <Logo className={styles.desktopLogo} />
      </Link>
      {navigation}
    </header>
  );
}
