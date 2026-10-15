import light from '../../assets/brand/logo-on-light.svg?no-inline';
import dark from '../../assets/brand/logo-on-dark.svg?no-inline';
import { brandContent } from '../../content/brand';
import styles from './Brand.module.css';
type Props = {
  tone?: 'on-light' | 'on-dark';
  decorative?: boolean;
  className?: string;
};
export function Logo({
  tone = 'on-light',
  decorative = false,
  className,
}: Props) {
  return (
    <span className={[styles.logo, className].filter(Boolean).join(' ')}>
      <img
        src={tone === 'on-dark' ? dark : light}
        width="600"
        height="82.8533"
        alt={decorative ? '' : brandContent.logoLabel}
      />
    </span>
  );
}
