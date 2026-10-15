import { loadLegacy } from './legacy';
import { bindRouteHandoff } from './route-handoff';
import { startFrontend } from './start';
import { bootstrapError } from '../content/bootstrap';

void startFrontend(
  window.location.pathname,
  async () => {
    if (import.meta.env.MODE === 'mock') {
      const { enableMocks } = await import('../../tests/msw/browser');
      await enableMocks();
    }
    const { mountApp } = await import('../app/mount');
    mountApp();
    bindRouteHandoff('app');
  },
  async () => {
    await loadLegacy();
    bindRouteHandoff('legacy');
  },
).catch(() => {
  const message = document.createElement('p');
  message.textContent = bootstrapError.message;
  message.setAttribute('role', 'alert');
  const reload = document.createElement('button');
  reload.textContent = bootstrapError.action;
  reload.addEventListener('click', () => window.location.reload());
  document.body.replaceChildren(message, reload);
});
