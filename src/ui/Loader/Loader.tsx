import { useRef } from 'react';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';
import rosette from '../../assets/loader/rosette.svg?no-inline';
import styles from './Loader.module.css';
/** Web/Loader 188:17758; author rotation with a static reduced-motion fallback. The caller owns its source-backed loading copy. */
export function Loader({
  label,
  showLabel = true,
  className,
}: {
  label: string;
  showLabel?: boolean;
  className?: string;
}) {
  const glyph = useRef<HTMLImageElement>(null);
  const enabled = useMotionEnabled();
  return (
    <span
      className={[styles.loader, className].filter(Boolean).join(' ')}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <img
        ref={glyph}
        className={styles.rosette}
        src={rosette}
        width="24"
        height="24"
        alt=""
      />
      {enabled && <MotionEnhancement kind="loader" target={glyph} />}
      <span className={showLabel ? undefined : styles.srOnly}>{label}</span>
    </span>
  );
}
