import { frontendFor } from './routes';

export async function startFrontend(
  pathname: string,
  startApp: () => Promise<void>,
  startLegacy: () => Promise<void>,
): Promise<void> {
  if (frontendFor(pathname) === 'legacy') await startLegacy();
  else if (pathname === '/tv')
    // The hall TV must never stay blank: if the new board cannot start in its
    // browser, the legacy TV it replaced is still shipped as legacy.html.
    await startApp().catch(startLegacy);
  else await startApp();
}
