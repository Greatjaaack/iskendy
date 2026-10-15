/** The only route-to-frontend switch; backend paths remain unchanged. ADR-003. */
export const ROUTES = {
  '/': 'app',
  '/board': 'app',
  '/tv': 'legacy',
  '/staff': 'legacy',
  '/stats': 'legacy',
} as const;

export function frontendFor(pathname: string): 'app' | 'legacy' {
  return Object.hasOwn(ROUTES, pathname)
    ? ROUTES[pathname as keyof typeof ROUTES]
    : 'legacy';
}
