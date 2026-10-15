import { setupWorker } from 'msw/browser';
import { applyLinkedManualPreset } from '../../dev/manual-presets';
import {
  handlers,
  localFixtureResponse,
  resetFixtures,
  setFixture,
  setDelay,
  holdResponse,
  releaseResponse,
  requestStarts,
} from './handlers';
import { guestSignals } from '../../src/platform/guest-signals';
import type { NotificationState } from '../../src/platform/notifications';

declare global {
  interface Window {
    __ISKENDY_TEST__?: {
      transport: 'worker' | 'local';
      setFixture: typeof setFixture;
      setDelay: typeof setDelay;
      holdResponse: typeof holdResponse;
      releaseResponse: typeof releaseResponse;
      reset: typeof resetFixtures;
      requests: string[];
      signals: {
        events: string[];
        setPermission: (state: NotificationState) => void;
      };
    };
  }
}
export async function enableMocks(): Promise<void> {
  if (import.meta.env.MODE !== 'mock')
    throw new Error('Mocks require explicit mock mode');
  applyLinkedManualPreset();
  const transport =
    window.isSecureContext && 'serviceWorker' in navigator ? 'worker' : 'local';
  if (transport === 'worker') {
    const worker = setupWorker(...handlers);
    await worker.start({
      serviceWorker: { url: '/mockServiceWorker.js' },
      quiet: true,
      onUnhandledRequest(request, print) {
        if (new URL(request.url).pathname.startsWith('/api/')) print.error();
      },
    });
  } else {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href,
      );
      // Never forward a mock API request to a real restaurant, even for an unknown path.
      if (url.origin === location.origin && url.pathname.startsWith('/api/'))
        return localFixtureResponse(
          new Request(input instanceof Request ? input : url, init),
        );
      return originalFetch(input, init);
    };
  }
  const events: string[] = [];
  let permission: NotificationState = 'granted';
  let decided = false;
  // Mock preview never replaces MSW's root worker with /sw.js or opens real permission UI.
  // Production excludes this entire module; real adapters are covered separately.
  Object.assign(guestSignals, {
    initialize: async () => {},
    installGestureUnlock: () => () => {},
    unlockFromGesture: async () => {
      events.push('unlock');
    },
    requestPermissionFromGesture: async (
      onDecision?: (state: NotificationState) => void,
    ) => {
      events.push('permission');
      if (!decided && (permission === 'granted' || permission === 'denied')) {
        decided = true;
        onDecision?.(permission);
      }
      return permission;
    },
    subscribed: () => {
      events.push('subscribed');
    },
    rating: (number: number) => {
      events.push(`rating:${number}`);
    },
    ready: (number: number) => {
      events.push(`ready:${number}`);
    },
  });
  window.__ISKENDY_TEST__ = {
    transport,
    requests: requestStarts,
    setFixture,
    setDelay,
    holdResponse,
    releaseResponse,
    reset: () => {
      resetFixtures();
      events.length = 0;
      permission = 'granted';
      decided = false;
    },
    signals: {
      events,
      setPermission: (state) => {
        permission = state;
        decided = false;
      },
    },
  };
}
