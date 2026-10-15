type Sentinel = { release: () => Promise<void> };
type Lockable = {
  wakeLock?: { request: (type: 'screen') => Promise<Sentinel> };
};
/** UX-14 (owner, 12.10): keep the screen on from subscribing until «Готово».
 * The browser drops the lock when the tab hides; take it again on return. */
export function holdScreen(
  nav: Lockable = navigator as Lockable,
  doc: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  > = document,
): () => void {
  if (!nav.wakeLock) return () => {};
  let lock: Sentinel | null = null,
    live = true;
  const take = () => {
    if (doc.visibilityState !== 'visible') return;
    nav.wakeLock!.request('screen').then(
      (sentinel) => {
        if (live) lock = sentinel;
        else void sentinel.release().catch(() => {});
      },
      () => {},
    );
  };
  take();
  doc.addEventListener('visibilitychange', take);
  return () => {
    live = false;
    doc.removeEventListener('visibilitychange', take);
    void lock?.release().catch(() => {});
  };
}
