type Runtime = {
  entries: () => Pick<PerformanceEntry, 'name'>[];
  origin: string;
  fetchAsset: typeof fetch;
  reload: () => void;
};
/** WebKit retains a failed module fetch across reloads. Refresh only our observed hashed lazy-screen asset (rating, sheets) on the explicit reload gesture. */
export async function reloadRatingScreen(runtime?: Runtime): Promise<void> {
  const browser = runtime ?? {
    entries: () => performance.getEntriesByType('resource'),
    origin: window.location.origin,
    fetchAsset: (input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init),
    reload: () => window.location.reload(),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const asset = [...browser.entries()].reverse().find((entry) => {
      const url = new URL(entry.name, browser.origin);
      return (
        url.origin === browser.origin &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /^\/app\/lazy-screens-[a-zA-Z0-9_-]+\.js$/.test(url.pathname)
      );
    });
    if (asset)
      await browser.fetchAsset(new URL(asset.name, browser.origin).href, {
        method: 'GET',
        cache: 'reload',
        credentials: 'omit',
        mode: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      });
  } catch {
    // Offline, missing Performance API, or a failed cache refresh still permits an ordinary full reload.
  } finally {
    clearTimeout(timer);
    browser.reload();
  }
}
