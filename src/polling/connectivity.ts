import type { ApiError } from '../api/errors';
export type Connectivity = {
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  offlineSince: number | null;
};
export function createConnectivity() {
  let snapshot: Connectivity = {
    consecutiveFailures: 0,
    lastSuccessAt: null,
    offlineSince: null,
  };
  const listeners = new Set<() => void>();
  const update = (next: Connectivity) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    succeed(now: number): number {
      const duration =
        snapshot.offlineSince === null
          ? 0
          : Math.max(0, now - snapshot.offlineSince);
      update({
        consecutiveFailures: 0,
        lastSuccessAt: now,
        offlineSince: null,
      });
      return duration;
    },
    fail(error: ApiError, now: number): void {
      if (error.kind === 'aborted') return;
      update({
        ...snapshot,
        consecutiveFailures: snapshot.consecutiveFailures + 1,
        offlineSince: snapshot.offlineSince ?? snapshot.lastSuccessAt ?? now,
      });
    },
  };
}
export function isGuestOffline(
  state: Connectivity,
  now: number,
  afterMs = 30_000,
): boolean {
  return (
    state.consecutiveFailures > 0 &&
    state.offlineSince !== null &&
    now - state.offlineSince >= afterMs
  );
}
export function isStaffOffline(state: Connectivity): boolean {
  return state.consecutiveFailures >= 2;
}
export const connectivity = createConnectivity();
