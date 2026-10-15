import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

/** ADR-020: two addresses (/ and /board) with a query string; no library needed. */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('popstate', notify);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('popstate', notify);
  };
}
const address = () => location.pathname + location.search;

export function useLocation() {
  const href = useSyncExternalStore(subscribe, address, () => '/');
  const query = href.indexOf('?');
  return query < 0
    ? { pathname: href, search: '' }
    : { pathname: href.slice(0, query), search: href.slice(query) };
}
export function navigate(to: string, { replace = false } = {}) {
  // Through history so src/boot/route-handoff.ts still sees app ↔ legacy crossings.
  if (replace) history.replaceState(history.state, '', to);
  else history.pushState({ guestReturnTo: address() }, '', to);
  notify();
}
/** Only app-owned history entries may take the guest back; a direct link has a safe fallback. */
export function navigateBack(fallback: string) {
  const previous: unknown = history.state?.guestReturnTo;
  if (typeof previous === 'string' && /^\/(?:board)?(?:\?|$)/.test(previous))
    history.back();
  else navigate(fallback, { replace: true });
}
export const useNavigate = () => navigate;
export function Link({
  to,
  onClick,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          rest.target
        )
          return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
