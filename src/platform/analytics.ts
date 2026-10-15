const COUNTER = 110894396;
export const goalNames = [
  'sub_ok',
  'sub_fail',
  'sub_served',
  'order_ready',
  'rate',
  'feedback_sent',
  'notif_granted',
  'notif_denied',
] as const;
type Goal = (typeof goalNames)[number];
export type AnalyticsScreen = 'entry' | 'order' | 'queue' | 'help';
type Tag = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
type Runtime = {
  pathname: () => string;
  origin: string;
  document: Document;
  getTag: () => Tag | undefined;
  setTag: (tag: Tag) => void;
};
declare global {
  interface Window {
    ym?: Tag;
  }
}
const browserRuntime = (): Runtime => ({
  pathname: () => location.pathname,
  origin: location.origin,
  document,
  getTag: () => window.ym,
  setTag: (tag) => {
    window.ym = tag;
  },
});
const screens = {
  entry: ['/', 'Табло заказов'],
  order: ['/board?my=1', 'Мой заказ'],
  queue: ['/board?view=queue', 'Табло заказов'],
  help: ['/board?view=help', 'Помощь'],
} as const;
export function createAnalytics(
  runtime: () => Runtime = browserRuntime,
  options: { loadScript?: boolean } = {},
) {
  let initialized = false,
    lastHit = '';
  const allowed = () => ['/', '/board'].includes(runtime().pathname());
  const call = (...args: unknown[]) => {
    try {
      if (allowed()) runtime().getTag()?.(COUNTER, ...args);
    } catch {
      /* Blockers must never break the order. */
    }
  };
  return {
    initialize(): void {
      if (initialized || !allowed()) return;
      initialized = true;
      const env = runtime();
      if (!env.getTag()) {
        const tag: Tag = (...args) => {
          (tag.a ??= []).push(args);
        };
        tag.l = Date.now();
        env.setTag(tag);
      }
      if (
        options.loadScript !== false &&
        !env.document.querySelector(
          'script[src="https://mc.yandex.ru/metrika/tag.js"]',
        )
      ) {
        const script = env.document.createElement('script');
        script.src = 'https://mc.yandex.ru/metrika/tag.js';
        script.async = true;
        env.document.head.append(script);
      }
      // Manual first hit avoids duplicated pageviews and never transmits arbitrary query strings.
      call('init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
        defer: true,
      });
    },
    hit(screen: AnalyticsScreen): void {
      if (!allowed()) return;
      const [path, title] = screens[screen];
      const url = runtime().origin + path;
      if (url === lastHit) return;
      const referer = lastHit || runtime().origin;
      lastHit = url;
      call('hit', url, { referer, title });
    },
    goal(name: Goal): void {
      if (goalNames.includes(name)) call('reachGoal', name);
    },
  };
}
