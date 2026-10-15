import type { MouseEvent } from 'react';
/** Plain link for the lazy chunk (no router import); the parent routes in-app. */
export function spaClick(href: string, onNavigate?: (href: string) => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onNavigate ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onNavigate(href);
  };
}
