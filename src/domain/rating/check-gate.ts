import type { checkFeedback } from '../../api/endpoints/guest';
/** Serialise checks per number across subscription, served-check and rating recovery.
 * Always fetch fresh bytes; never use cached eligibility to resolve a lost POST. */
export function createFeedbackCheckGate(
  read: typeof checkFeedback,
  // Rate-limit intervals must not depend on device wall-clock corrections.
  now = () => performance.now(),
) {
  const last = new Map<number, number>();
  const queues = new Map<number, Promise<unknown>>();
  const pause = (
    milliseconds: number,
    signal?: AbortSignal,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }
      if (milliseconds <= 0) {
        resolve(true);
        return;
      }
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        resolve(ok);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(() => finish(true), milliseconds);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  return (
    number: number,
    options: Parameters<typeof checkFeedback>[1] = {},
  ): ReturnType<typeof checkFeedback> => {
    const task = (queues.get(number) ?? Promise.resolve()).then(async () => {
      const at = last.get(number);
      if (
        !(await pause(
          at === undefined ? 0 : Math.max(0, 20_000 - (now() - at)),
          options.signal,
        ))
      )
        return { ok: false as const, error: { kind: 'aborted' as const } };
      last.set(number, now());
      for (const [key, value] of last)
        if (now() - value > 120_000) last.delete(key);
      return read(number, options);
    });
    queues.set(number, task);
    const clear = () => {
      if (queues.get(number) === task) queues.delete(number);
    };
    void task.then(clear, clear);
    return task;
  };
}
