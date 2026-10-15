import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, type ReactNode } from 'react';
import { reviewContent } from '../../content/review';
import { ordersContent } from '../../content/orders';
import { Icon } from '../Icon/Icon';
import styles from './Sheet.module.css';

/** Bottom sheet below 768 px (S4 672:23871, S1b 669:23692), centred 480 px dialog
 * from 768 px (684:52232, 684:51957). Focus trap, Esc and focus return come from Radix. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  closeButton = false,
  focusField = false,
  layer = 'base',
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  closeButton?: boolean;
  /** Start in the first input (add order) instead of the first button. */
  focusField?: boolean;
  layer?: 'base' | 'nested';
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    // VisualViewport describes usable space; the OS alone draws and rounds its keyboard.
    const place = () => {
      const element = content.current;
      if (!element) return;
      const height = viewport?.height ?? window.innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      const covered = Math.max(0, window.innerHeight - height - offset);
      const wide =
        window.matchMedia('(min-width: 768px)').matches; /* figma: 794:396 */
      element.style.maxHeight = Math.max(0, height - 32) + 'px';
      element.style.bottom = wide ? 'auto' : covered + 'px';
      element.style.top = wide
        ? offset + Math.max(16, (height - element.offsetHeight) / 2) + 'px'
        : 'auto';
    };
    place();
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (content.current) observer?.observe(content.current);
    // Radix may mount its portal after the open effect. Measure the actual sheet once mounted.
    const frame = requestAnimationFrame(() => {
      place();
      if (content.current) observer?.observe(content.current);
    });
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} data-layer={layer} />
        <Dialog.Content
          ref={content}
          className={styles.sheet}
          data-layer={layer}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            const field = focusField
              ? content.current?.querySelector<HTMLElement>(
                  'input:not([type=file]), textarea',
                )
              : null;
            if (!field) return;
            event.preventDefault();
            field.focus();
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <button
            type="button"
            className={styles.grabber}
            aria-label={reviewContent.closeSheet}
            onClick={() => onOpenChange(false)}
            onPointerDown={(event) => {
              drag.current = event.clientY;
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerUp={(event) => {
              if (drag.current !== null && event.clientY - drag.current > 64)
                onOpenChange(false);
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <span />
          </button>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            {closeButton && (
              <Dialog.Close
                className={styles.close}
                aria-label={ordersContent.dismiss}
              >
                <Icon name="close" />
              </Dialog.Close>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
