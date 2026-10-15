import {
  useImperativeHandle,
  useRef,
  type Ref,
  type ButtonHTMLAttributes,
} from 'react';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';
import { buttonContent } from '../../content/button';
import styles from './Button.module.css';
export const buttonVariants = ['primary', 'secondary', 'tertiary'] as const;
export const buttonStates = [
  'default',
  'hover',
  'pressed',
  'focus',
  'disabled',
  'loading',
] as const;
export type ButtonVariant = (typeof buttonVariants)[number];
export type ButtonState = (typeof buttonStates)[number];
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  ref?: Ref<HTMLButtonElement>;
  label?: string;
  variant?: ButtonVariant;
  state?: ButtonState;
};
/** Web/Button 67:44. Loading preserves its action name and blocks repeat submissions. */
export function Button({
  ref: forwardedRef,
  label = buttonContent.defaultLabel,
  variant = 'primary',
  state = 'default',
  disabled = false,
  type = 'button',
  className,
  ...rest
}: Props) {
  const button = useRef<HTMLButtonElement>(null);
  useImperativeHandle(forwardedRef, () => button.current!, []);
  const glyph = useRef<HTMLSpanElement>(null);
  const enabled = useMotionEnabled();
  const currentState = disabled && state !== 'loading' ? 'disabled' : state;
  const loading = currentState === 'loading';
  return (
    <button
      {...rest}
      ref={button}
      type={type}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(' ')}
      data-state={currentState}
      disabled={disabled || loading || currentState === 'disabled'}
      aria-busy={loading || undefined}
      aria-label={loading ? label : rest['aria-label']}
    >
      <span
        className={styles.label}
        aria-hidden={loading || undefined}
        data-hidden={loading}
      >
        {label}
      </span>
      <span
        className={styles.loadingLabel}
        aria-hidden={!loading || undefined}
        data-hidden={!loading}
      >
        <span ref={glyph} aria-hidden="true" className={styles.loaderGlyph} />
        <span>
          {variant === 'primary'
            ? buttonContent.primaryLoading
            : buttonContent.otherLoading}
        </span>
      </span>
      {enabled && (
        <MotionEnhancement
          kind={loading ? 'loader' : 'button'}
          target={loading ? glyph : button}
        />
      )}
    </button>
  );
}

/** Native link using the same secondary/tertiary Figma button geometry and focus states. */
export function ButtonLink({
  ref: forwardedRef,
  label,
  variant = 'secondary',
  className,
  ...rest
}: Omit<import('react').AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  ref?: Ref<HTMLAnchorElement>;
  label: string;
  variant?: 'secondary' | 'tertiary';
}) {
  const target = useRef<HTMLAnchorElement>(null);
  useImperativeHandle(forwardedRef, () => target.current!, []);
  const enabled = useMotionEnabled();
  return (
    <a
      {...rest}
      ref={target}
      className={[styles.button, styles[variant], styles.link, className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.label}>{label}</span>
      {enabled && <MotionEnhancement kind="button" target={target} />}
    </a>
  );
}
