import type { ComponentType } from 'react';
import { lazy, Suspense, useEffect, useState, type RefObject } from 'react';
export type MotionProps = {
  kind:
    | 'loader'
    | 'ticker'
    | 'button'
    | 'surface'
    | 'slider'
    | 'dock'
    | 'card'
    | 'control'
    | 'cursor';
  target: RefObject<HTMLElement | null>;
  cycle?: RefObject<HTMLElement | null>;
  host?: RefObject<HTMLElement | null>;
  fill?: RefObject<HTMLElement | null>;
  value?: number | string;
};
const Runtime = lazy<ComponentType<MotionProps>>(() =>
  import('./runtime').catch(() => ({ default: () => null })),
);
/** Enhancement starts after the static render. Reduced motion never loads GSAP. */
export function useMotionEnabled(active = true) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAllowed(!media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return active && allowed;
}
export function MotionEnhancement(props: MotionProps) {
  return (
    <Suspense fallback={null}>
      <Runtime {...props} />
    </Suspense>
  );
}
