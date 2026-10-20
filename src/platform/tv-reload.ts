export const TV_RELOAD_EVERY_MS = 3_600_000;

/**
 * Kiosk insurance against a day of uptime, as on the legacy TV: reload once an
 * hour, but only after the server answers — never into a browser error page.
 */
export function scheduleHealthyReload({
  isHealthy,
  reload,
  everyMs = TV_RELOAD_EVERY_MS,
}: {
  isHealthy: () => Promise<boolean>;
  reload: () => void;
  everyMs?: number;
}): () => void {
  const timer = setInterval(() => {
    void isHealthy().then(
      (ok) => {
        if (ok) reload();
      },
      () => {},
    );
  }, everyMs);
  return () => clearInterval(timer);
}
