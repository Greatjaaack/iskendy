import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Icon } from '../ui/Icon/Icon';
import { motion } from '../styles/motion';
import styles from './CursorFollower.module.css';

/** Owner-requested Cuberto-style follower. Never intercepts input or touch. */
export function CursorFollower() {
  const cursor = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const dot = cursor.current,
      disc = bubble.current;
    if (!dot || !disc) return;
    const media = gsap.matchMedia();
    media.add(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
      (_ctx, contextSafe) => {
        const x = gsap.quickTo(dot, 'x', {
          duration: motion.cursorFollowSeconds,
          ease: motion.quietEase,
        });
        const y = gsap.quickTo(dot, 'y', {
          duration: motion.cursorFollowSeconds,
          ease: motion.quietEase,
        });
        let visible = false,
          current = '';
        const hide = contextSafe!(() => {
          visible = false;
          document.documentElement.removeAttribute('data-guest-cursor');
          gsap.to(dot, {
            opacity: 0,
            duration: motion.cursorStateSeconds,
            overwrite: 'auto',
          });
        }) as () => void;
        const move = contextSafe!((event: PointerEvent) => {
          const target = event.target instanceof Element ? event.target : null;
          if (
            event.pointerType !== 'mouse' ||
            !target ||
            document.querySelector('[role="dialog"]') ||
            target.closest('input, textarea, select, [contenteditable]')
          ) {
            hide();
            return;
          }
          if (!visible) {
            gsap.set(dot, { x: event.clientX, y: event.clientY });
            gsap.to(dot, {
              opacity: 1,
              duration: motion.cursorStateSeconds,
              overwrite: 'auto',
            });
            visible = true;
            document.documentElement.setAttribute('data-guest-cursor', 'true');
          }
          x(event.clientX);
          y(event.clientY);
          const action = target.closest<HTMLElement>('[data-cursor-label]');
          disc.dataset.tone = action?.dataset.cursorTone ?? 'default';
          const next =
            action && !action.matches(':disabled,[aria-disabled="true"]')
              ? (action.dataset.cursorLabel ?? '')
              : '';
          if (current !== next) {
            current = next;

            gsap.to(disc, {
              scale: next ? 1 : 0.12,
              opacity: next ? 1 : 0,
              duration: motion.cursorStateSeconds,
              ease: motion.quietEase,
              overwrite: true,
            });
          }
        }) as (event: PointerEvent) => void;
        const visibility = () => {
          if (document.hidden) hide();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerleave', hide);
        document.addEventListener('pointerdown', hide);
        document.addEventListener('keydown', hide);
        document.addEventListener('scroll', hide, true);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('blur', hide);
        return () => {
          document.documentElement.removeAttribute('data-guest-cursor');
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerleave', hide);
          document.removeEventListener('pointerdown', hide);
          document.removeEventListener('keydown', hide);
          document.removeEventListener('scroll', hide, true);
          document.removeEventListener('visibilitychange', visibility);
          window.removeEventListener('blur', hide);
          [x, y].forEach((setter) => setter.tween.kill());
        };
      },
    );
    return () => media.revert();
  });
  return createPortal(
    <>
      <div
        ref={cursor}
        className={styles.cursor}
        aria-hidden="true"
        data-cursor-follower
      >
        <span className={styles.dot} />
        <span ref={bubble} className={styles.bubble}>
          <Icon name="arrow-right" />
        </span>
      </div>
    </>,
    document.body,
  );
}
