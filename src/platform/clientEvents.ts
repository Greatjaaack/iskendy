import { sendClientEvent } from '../api/endpoints/guest';
type Screen = 'entry' | 'order' | 'queue' | 'help';
type Report = {
  kind: 'offline' | 'render' | 'js';
  screen: Screen;
  durationMs?: number;
};
/** Only allowlisted generated details: never pass raw exceptions, URLs, tokens or form text. */
export function createClientReporter(
  send = sendClientEvent,
  // The ADR-015 budget measures elapsed time, independent of wall-clock corrections.
  now = () => performance.now(),
) {
  let lastSentAt = -Infinity,
    subscriptions = 0;
  return {
    beginSubscription(): () => void {
      subscriptions += 1;
      let released = false;
      return () => {
        if (!released) {
          subscriptions -= 1;
          released = true;
        }
      };
    },
    report({ kind, screen, durationMs = 0 }: Report): boolean {
      const time = now();
      if (subscriptions || time - lastSentAt < 60_000) return false;
      lastSentAt = time;
      const seconds = Number.isFinite(durationMs)
        ? Math.max(0, Math.floor(durationMs / 1000))
        : 0;
      const detail =
        kind === 'offline'
          ? `Экран был без связи ${seconds} с`
          : kind === 'render'
            ? 'Ошибка отображения экрана'
            : 'Ошибка выполнения скрипта';
      void send({ kind, screen, detail: detail.slice(0, 300) }).catch(() => {});
      return true;
    },
  };
}
export function installErrorReporting(
  reporter: ReturnType<typeof createClientReporter>,
  screen: () => Screen,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const report = () => {
    reporter.report({ kind: 'js', screen: screen() });
  };
  target.addEventListener('error', report);
  target.addEventListener('unhandledrejection', report);
  return () => {
    target.removeEventListener('error', report);
    target.removeEventListener('unhandledrejection', report);
  };
}
