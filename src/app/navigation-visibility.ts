import { useSyncExternalStore } from 'react';
type Visibility = 'visible' | 'hidden' | 'keyboard';
export function createNavigationVisibility(
  runtime: () => Window = () => window,
) {
  let state: Visibility = 'visible',
    lastY = 0,
    // UX-13: the field the floating menu covered; hidden menus move away.
    covered: Element | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Visibility) => {
    if (next === state) return;
    state = next;
    for (const changed of listeners) changed();
  };
  const focus = () => {
    const win = runtime(),
      element = win.document.activeElement;
    if (element?.closest('[data-guest-navigation]')) {
      set('visible');
      return;
    }
    const editable =
      element instanceof HTMLElement &&
      (element.matches('input,textarea') || element.isContentEditable);
    const keyboard =
      win.visualViewport && win.innerHeight - win.visualViewport.height > 120;
    // A short landscape screen puts the field under the menu with no keyboard.
    if (editable && !keyboard && covered !== element && under(win, element))
      covered = element;
    if (editable && (keyboard || covered === element)) {
      set('keyboard');
      return;
    }
    covered = null;
    set('visible');
    lastY = Math.max(0, win.scrollY);
  };
  const scroll = () => {
    const win = runtime(),
      y = Math.max(0, win.scrollY);
    if (
      win.document.activeElement?.closest('[data-guest-navigation]') ||
      state === 'keyboard'
    )
      return;
    if (y <= 16) {
      set('visible');
      lastY = y;
      return;
    }
    if (Math.abs(y - lastY) < 8) return;
    set(y > lastY ? 'hidden' : 'visible');
    lastY = y;
  };
  const focusOut = () => queueMicrotask(focus);
  return {
    getSnapshot: () => state,
    subscribe(changed: () => void) {
      const win = runtime();
      if (!listeners.size) {
        lastY = Math.max(0, win.scrollY);
        win.addEventListener('scroll', scroll, { passive: true });
        win.addEventListener('resize', focus);
        win.document.addEventListener('focusin', focus);
        win.document.addEventListener('focusout', focusOut);
        win.visualViewport?.addEventListener('resize', focus);
        win.visualViewport?.addEventListener('scroll', focus);
      }
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
        if (!listeners.size) {
          win.removeEventListener('scroll', scroll);
          win.removeEventListener('resize', focus);
          win.document.removeEventListener('focusin', focus);
          win.document.removeEventListener('focusout', focusOut);
          win.visualViewport?.removeEventListener('resize', focus);
          win.visualViewport?.removeEventListener('scroll', focus);
          state = 'visible';
        }
      };
    },
  };
}
function under(win: Window, field: Element) {
  const box = field.getBoundingClientRect();
  return [...win.document.querySelectorAll('[data-guest-navigation]')].some(
    (menu) => {
      const nav = menu.getBoundingClientRect();
      return (
        nav.width > 0 &&
        nav.height > 0 &&
        box.left < nav.right &&
        nav.left < box.right &&
        box.top < nav.bottom &&
        nav.top < box.bottom
      );
    },
  );
}
const visibility = createNavigationVisibility();
/** Browser controls are outside the page. Never draw or infer their pixel artwork. */
export const useNavigationVisibility = () =>
  useSyncExternalStore(
    visibility.subscribe,
    visibility.getSnapshot,
    () => 'visible' as const,
  );
