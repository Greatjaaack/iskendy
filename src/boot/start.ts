import { frontendFor } from './routes';

export async function startFrontend(
  pathname: string,
  startApp: () => Promise<void>,
  startLegacy: () => Promise<void>,
): Promise<void> {
  if (frontendFor(pathname) === 'legacy') await startLegacy();
  else await startApp();
}
