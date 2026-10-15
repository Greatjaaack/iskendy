import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { CursorFollower } from './CursorFollower';
import { motion } from '../styles/motion';
import type { MotionProps } from './MotionEnhancement';
gsap.registerPlugin(useGSAP);
function Loop({ kind, target, cycle }: MotionProps) {
  useGSAP(
    () => {
      const node = target.current;
      if (!node) return;
      const media = gsap.matchMedia();
      media.add(
        '(prefers-reduced-motion: no-preference)',
        (_mediaContext, contextSafe) => {
          let tween: gsap.core.Tween | undefined;
          let disposed = false;
          const visibility = () =>
            tween?.paused(document.visibilityState === 'hidden');
          const rebuild = () => {
            if (disposed) return;
            const progress = tween?.progress() ?? 0;
            tween?.kill();
            if (kind === 'ticker') {
              const distance =
                (cycle?.current?.getBoundingClientRect().width ?? 0) +
                parseFloat(getComputedStyle(node).columnGap || '0');
              if (!(distance > 0)) return;
              tween = gsap.fromTo(
                node,
                { x: 0 },
                {
                  x: -distance,
                  duration: distance / motion.tickerPixelsPerSecond,
                  ease: motion.linear,
                  repeat: -1,
                },
              );
            } else
              tween = gsap.fromTo(
                node,
                { rotation: 0 },
                {
                  rotation: 360,
                  duration: motion.loaderSeconds,
                  ease: motion.linear,
                  repeat: -1,
                  transformOrigin: '50% 50%',
                },
              );
            tween.progress(progress);
            visibility();
          };
          const safeRebuild = contextSafe ? contextSafe(rebuild) : rebuild;
          safeRebuild();
          const observer =
            kind === 'ticker' &&
            cycle?.current &&
            typeof ResizeObserver !== 'undefined'
              ? new ResizeObserver(() => safeRebuild())
              : undefined;
          if (observer && cycle?.current) observer.observe(cycle.current);
          if (kind === 'ticker')
            void document.fonts?.ready.then(() => safeRebuild());
          document.addEventListener('visibilitychange', visibility);
          return () => {
            disposed = true;
            observer?.disconnect();
            document.removeEventListener('visibilitychange', visibility);
            tween?.kill();
          };
        },
      );
      return () => media.revert();
    },
    { scope: target, dependencies: [kind], revertOnUpdate: true },
  );
  return null;
}
function Press({ target, kind }: MotionProps) {
  useGSAP(
    (_context, contextSafe) => {
      const node = target.current;
      if (!node) return;
      let tween: gsap.core.Tween | undefined;
      let hovered = false;
      const set = (pressed: boolean) => {
        tween?.kill();
        const disabled = node.matches(':disabled,[aria-disabled="true"]');
        tween = gsap.to(node, {
          scale: disabled
            ? 1
            : pressed
              ? motion.buttonPressScale
              : hovered
                ? motion.controlHoverScale
                : 1,
          duration: motion.buttonSeconds,
          ease: motion.quietEase,
          overwrite: true,
        });
      };
      const down = contextSafe ? contextSafe(() => set(true)) : () => set(true);
      const up = contextSafe ? contextSafe(() => set(false)) : () => set(false);
      const enter = contextSafe!((event: PointerEvent) => {
        if (kind === 'control' && event.pointerType === 'mouse') {
          hovered = true;
          set(false);
        }
      });
      const leave = contextSafe!(() => {
        hovered = false;
        set(false);
      });
      const keyDown = (event: KeyboardEvent) => {
        if (!event.repeat && (event.key === ' ' || event.key === 'Enter'))
          down();
      };
      const keyUp = (event: KeyboardEvent) => {
        if (event.key === ' ' || event.key === 'Enter') up();
      };
      const hidden = () => {
        if (document.visibilityState === 'hidden') {
          hovered = false;
          tween?.kill();
          gsap.set(node, { scale: 1 });
        }
      };
      const safeHidden = contextSafe ? contextSafe(hidden) : hidden;
      node.addEventListener('pointerenter', enter);
      node.addEventListener('pointerleave', leave);
      node.addEventListener('pointerdown', down);
      node.addEventListener('keydown', keyDown);
      node.addEventListener('keyup', keyUp);
      for (const event of ['pointerup', 'pointercancel', 'blur'])
        node.addEventListener(event, up);
      document.addEventListener('visibilitychange', safeHidden);
      return () => {
        tween?.kill();
        node.removeEventListener('pointerenter', enter);
        node.removeEventListener('pointerleave', leave);
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('keydown', keyDown);
        node.removeEventListener('keyup', keyUp);
        for (const event of [
          'pointerup',
          'pointercancel',
          'pointerleave',
          'blur',
        ])
          node.removeEventListener(event, up);
        document.removeEventListener('visibilitychange', safeHidden);
      };
    },
    { scope: target },
  );
  return null;
}
function StateTween({ kind, target, host, fill, value }: MotionProps) {
  const tween = useRef<gsap.core.Tween | null>(null),
    fillTween = useRef<gsap.core.Tween | null>(null);
  const initialized = useRef(false);
  useGSAP(
    () => {
      const node = target.current;
      if (!node) return;
      tween.current?.kill();
      fillTween.current?.kill();
      if (kind === 'surface') {
        tween.current = gsap.to(node, {
          backgroundColor: getComputedStyle(node)
            .getPropertyValue(String(value))
            .trim(),
          duration: initialized.current ? motion.sliderSeconds : 0,
          ease: motion.quietEase,
          overwrite: true,
        });
      } else if (kind === 'slider') {
        const x = Number(value);
        const previous = initialized.current
          ? Number(gsap.getProperty(node, 'x'))
          : x;
        tween.current = gsap.fromTo(
          node,
          { x: previous },
          {
            x,
            duration: initialized.current ? motion.sliderSeconds : 0,
            ease: motion.quietEase,
            overwrite: true,
          },
        );
        const frame = node.closest('[data-value]');
        if (frame) {
          frame
            .querySelectorAll<HTMLElement>('[data-slider-mark]')
            .forEach((mark) => {
              gsap.to(mark, {
                opacity: mark.dataset.active === 'true' ? 1 : 0,
                duration: initialized.current ? motion.sliderSeconds : 0,
                overwrite: true,
              });
            });
        }
        if (fill?.current) {
          const width = x + 56;
          const previousWidth = initialized.current
            ? Number(gsap.getProperty(fill.current, 'width'))
            : width;
          fillTween.current = gsap.fromTo(
            fill.current,
            { width: previousWidth },
            {
              width,
              backgroundColor: frame
                ? getComputedStyle(frame)
                    .getPropertyValue('--color-emotion-active')
                    .trim()
                : getComputedStyle(fill.current).backgroundColor,
              duration: initialized.current ? motion.sliderSeconds : 0,
              ease: motion.quietEase,
              overwrite: true,
            },
          );
        }
      } else {
        const root = host?.current;
        if (!root) return;
        const keyboard = value === 'keyboard',
          focused = root.contains(document.activeElement);
        const y =
          value === 'visible' || focused
            ? 0
            : root.getBoundingClientRect().height +
              parseFloat(getComputedStyle(root).bottom || '0');
        if (
          !initialized.current ||
          keyboard ||
          focused ||
          document.visibilityState === 'hidden'
        )
          gsap.set(node, { y });
        else
          tween.current = gsap.to(node, {
            y,
            duration: motion.dockSeconds,
            ease: motion.quietEase,
            overwrite: true,
          });
        root.setAttribute('data-motion', 'active');
      }
      initialized.current = true;
    },
    { scope: target, dependencies: [kind, value] },
  );
  useLayoutEffect(() => {
    const root = host?.current;
    const finish = () => {
      tween.current?.progress(1);
      tween.current?.kill();
      fillTween.current?.progress(1);
      fillTween.current?.kill();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') finish();
    };
    const focus = () => {
      if (kind === 'dock' && target.current) {
        tween.current?.kill();
        gsap.set(target.current, { y: 0 });
      }
    };
    document.addEventListener('visibilitychange', visibility);
    root?.addEventListener('focusin', focus);
    return () => {
      tween.current?.kill();
      fillTween.current?.kill();
      document.removeEventListener('visibilitychange', visibility);
      root?.removeEventListener('focusin', focus);
      if (root) root.removeAttribute('data-motion');
    };
  }, [kind, host, target]);
  return null;
}
function CardHover({ target }: MotionProps) {
  useGSAP(
    (_context, contextSafe) => {
      const root = target.current;
      if (!root) return;
      const tweens = new Map<HTMLElement, gsap.core.Tween>();
      const change = (event: PointerEvent | FocusEvent, entering: boolean) => {
        if (
          'pointerType' in event &&
          (event.pointerType !== 'mouse' ||
            !window.matchMedia('(hover: hover) and (pointer: fine)').matches)
        )
          return;
        const card = (event.target as Element).closest<HTMLElement>(
          '[data-hover-card], [data-faq]',
        );
        if (
          !card ||
          !root.contains(card) ||
          card.contains(event.relatedTarget as Node | null)
        )
          return;
        if (card.matches('[data-faq]')) {
          const front = card.querySelector<HTMLElement>('[data-faq-front]');
          const back = card.querySelector<HTMLElement>('[data-faq-back]');
          if (front && back) {
            if (!tweens.has(back)) gsap.set(back, { y: 0, yPercent: 105 });
            for (const [node, yPercent, opacity] of [
              [front, entering ? -105 : 0, entering ? 0 : 1],
              [back, entering ? 0 : 105, entering ? 1 : 0],
            ] as const) {
              tweens.get(node)?.kill();
              tweens.set(
                node,
                gsap.to(node, {
                  y: 0,
                  yPercent,
                  opacity,
                  visibility: 'visible',
                  duration: motion.faqFlipSeconds,
                  ease: motion.quietEase,
                  overwrite: true,
                }),
              );
            }
          }
          return;
        }
        if (event.type.startsWith('focus')) return;
        tweens.get(card)?.kill();
        tweens.set(
          card,
          gsap.to(card, {
            scale: entering ? motion.cardHoverScale : 1,
            duration: motion.cardHoverSeconds,
            ease: motion.quietEase,
            overwrite: true,
          }),
        );
      };
      const enter = contextSafe!((event: PointerEvent) => change(event, true));
      const leave = contextSafe!((event: PointerEvent) => change(event, false));
      const focus = contextSafe!((event: FocusEvent) => change(event, true));
      const blur = contextSafe!((event: FocusEvent) => change(event, false));
      root.addEventListener('focusin', focus);
      root.addEventListener('focusout', blur);
      root.addEventListener('pointerover', enter);
      root.addEventListener('pointerout', leave);
      return () => {
        tweens.forEach((tween) => tween.kill());
        root.removeEventListener('focusin', focus);
        root.removeEventListener('focusout', blur);
        root.removeEventListener('pointerover', enter);
        root.removeEventListener('pointerout', leave);
      };
    },
    { scope: target },
  );
  return null;
}
export default function Runtime(props: MotionProps) {
  if (props.kind === 'loader' || props.kind === 'ticker')
    return <Loop {...props} />;
  if (props.kind === 'cursor') return <CursorFollower />;
  if (props.kind === 'card') return <CardHover {...props} />;
  if (props.kind === 'button' || props.kind === 'control')
    return <Press {...props} />;
  return <StateTween {...props} />;
}
