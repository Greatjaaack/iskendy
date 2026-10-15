import { frontendFor } from './routes';

type HandoffBrowser = {
  history: Pick<History, 'pushState' | 'replaceState'>;
  location: Pick<Location, 'pathname' | 'reload'>;
  addEventListener: (type: 'popstate', listener: () => void) => void;
  removeEventListener: (type: 'popstate', listener: () => void) => void;
};

/**
 * Legacy pushes bare /board only for the staff «← Гостевое табло» link. Bare /board is now the
 * receipt-QR entry (UX-22), so the staff link goes to the queue. The legacy snapshot stays intact.
 */
function legacyBoardTarget(url: string | URL | null | undefined) {
  if (url == null) return url;
  const target = new URL(String(url), 'https://legacy.invalid');
  return target.pathname === '/board' && target.search === ''
    ? '/board?view=queue'
    : url;
}
/** Reload only when navigation crosses the app/legacy boundary; preserve URL and storage. */
export function bindRouteHandoff(
  currentFrontend: 'app' | 'legacy',
  browser: HandoffBrowser = window,
): () => void {
  const { history } = browser;
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  let active = true;
  const handoff = () => {
    if (active && frontendFor(browser.location.pathname) !== currentFrontend)
      browser.location.reload();
  };
  const push: History['pushState'] = (data, unused, url) => {
    pushState.call(
      history,
      data,
      unused,
      currentFrontend === 'legacy' ? legacyBoardTarget(url) : url,
    );
    handoff();
  };
  const replace: History['replaceState'] = (...args) => {
    replaceState.apply(history, args);
    handoff();
  };
  history.pushState = push;
  history.replaceState = replace;
  browser.addEventListener('popstate', handoff);
  return () => {
    active = false;
    if (history.pushState === push) history.pushState = pushState;
    if (history.replaceState === replace) history.replaceState = replaceState;
    browser.removeEventListener('popstate', handoff);
  };
}
