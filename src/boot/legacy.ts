/** ADR-003 exception: only the pinned, same-origin legacy document is written. */
export async function loadLegacy(
  fetchDocument: typeof fetch = fetch,
  target: Pick<Document, 'open' | 'write' | 'close'> = document,
  timeoutMs = 8_000,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchDocument('/legacy.html', {
      cache: 'no-cache',
      signal: controller.signal,
      redirect: 'error',
    });
    if (
      !response.ok ||
      !response.headers.get('Content-Type')?.includes('text/html')
    ) {
      throw new Error('Legacy document unavailable');
    }
    const html = await response.text();
    if (!/^\s*<!doctype html>/i.test(html))
      throw new Error('Invalid legacy document');
    target.open();
    target.write(html);
    target.close();
  } finally {
    clearTimeout(timer);
  }
}
