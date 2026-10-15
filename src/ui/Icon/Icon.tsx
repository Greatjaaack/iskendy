import styles from './Icon.module.css';
export const iconNames = [
  'bell',
  'pin',
  'clock',
  'arrow-right',
  'arrow-left',
  'board',
  'check',
  'receipt',
  'star',
  'star-filled',
  'telegram',
  'vk',
  'instagram',
  'play',
  'hourglass',
  'check-circle',
  'seal-check',
  'alert-circle',
  'chevron-down',
  'plus',
  'more-horizontal',
  'close',
  'minus-circle',
] as const;
export type IconName = (typeof iconNames)[number];
type Props = { name: IconName; label?: string; className?: string };
/** Web/Icon 72:53. Decorative by default; name standalone meaningful icons. */
export function Icon({ name, label, className }: Props) {
  return (
    <span
      className={[styles.icon, styles[name], className]
        .filter(Boolean)
        .join(' ')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
