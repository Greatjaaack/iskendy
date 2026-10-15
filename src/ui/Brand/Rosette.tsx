import rosette from '../../assets/brand/rosette.svg?no-inline';
import styles from './Brand.module.css';
export function Rosette({ className }: { className?: string }) {
  return (
    <span
      className={[styles.rosette, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <img src={rosette} width="100" height="101.333" alt="" />
    </span>
  );
}
