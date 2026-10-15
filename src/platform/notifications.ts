import {
  readyNotification,
  ratingNotification,
} from '../content/notifications';

type Runtime = {
  api?: typeof Notification;
  worker?: Pick<ServiceWorkerContainer, 'register' | 'ready'>;
};
export type NotificationState = NotificationPermission | 'unsupported';
const browserRuntime = (): Runtime => ({
  api: typeof Notification === 'undefined' ? undefined : Notification,
  worker: navigator.serviceWorker,
});
export function createNotifications(runtime: () => Runtime = browserRuntime) {
  let registration: Promise<ServiceWorkerRegistration | undefined> | undefined;
  const state = (): NotificationState => {
    const { api, worker } = runtime();
    return api && worker ? api.permission : 'unsupported';
  };
  async function register() {
    if (!registration) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const attempt = (async () => {
        const worker = runtime().worker;
        if (!worker) return undefined;
        await worker.register('/sw.js');
        return worker.ready;
      })();
      registration = Promise.race([
        attempt,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), 5_000);
        }),
      ])
        .catch(() => undefined)
        .finally(() => clearTimeout(timer));
    }
    return registration;
  }
  async function show(message: { title: string; body: string }): Promise<void> {
    if (state() !== 'granted') return;
    const options = {
      body: message.body,
      icon: '/assets/logo_white.png',
      badge: '/assets/logo_white.png',
      vibrate: [90, 70, 90, 70, 160],
      tag: 'iskendy-order',
      renotify: true,
    };
    try {
      const reg = await register();
      if (reg) {
        await reg.showNotification(message.title, options);
        return;
      }
    } catch {
      /* Fall through to the desktop Notification constructor. */
    }
    try {
      const API = runtime().api;
      if (API) new API(message.title, options);
    } catch {
      /* Sound and status remain available. */
    }
  }
  return {
    state,
    async initialize(): Promise<void> {
      if (state() === 'granted') await register();
    },
    async requestFromSubscribeGesture(): Promise<NotificationState> {
      const current = state();
      if (current === 'unsupported' || current === 'denied') return current;
      try {
        const api = runtime().api;
        if (!api) return 'unsupported';
        const permission =
          current === 'granted' ? current : await api.requestPermission();
        if (permission === 'granted') void register();
        return permission;
      } catch {
        return state();
      }
    },
    showReady: (number: number) => show(readyNotification(number)),
    showRatingPrompt: (number: number) => show(ratingNotification(number)),
  };
}
