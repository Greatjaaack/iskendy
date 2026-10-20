import type { Board } from '../../api/schemas/guest';

export type TvState = 'populated' | 'empty' | 'no-connection' | 'overflow';
export type TvColumn = { numbers: number[]; more: number };
export type TvView = { state: TvState; preparing: TvColumn; ready: TvColumn };

/** TV 02 56:96: up to 6 numbers per column, overflow 66:1202 up to 12. */
export const TV_POPULATED_CAPACITY = 6;
export const TV_OVERFLOW_CAPACITY = 12;

// Q-30: the server list is never trimmed by age. When a column exceeds the
// overflow grid, the last cell becomes «+N», as the legacy TV does.
function column(numbers: number[]): TvColumn {
  if (numbers.length <= TV_OVERFLOW_CAPACITY) return { numbers, more: 0 };
  const shown = numbers.slice(0, TV_OVERFLOW_CAPACITY - 1);
  return { numbers: shown, more: numbers.length - shown.length };
}

/** Board snapshot → TV columns. Offline never shows retained numbers. */
export function tvView(board: Board | undefined, offline: boolean): TvView {
  const none = { numbers: [], more: 0 };
  if (offline) return { state: 'no-connection', preparing: none, ready: none };
  const orders = board?.orders ?? [];
  const preparing = orders
    .filter((order) => order.status !== 'ready')
    .map((order) => order.number);
  const ready = orders
    .filter((order) => order.status === 'ready')
    .map((order) => order.number);
  const longest = Math.max(preparing.length, ready.length);
  const state: TvState =
    longest === 0
      ? 'empty'
      : longest <= TV_POPULATED_CAPACITY
        ? 'populated'
        : 'overflow';
  return { state, preparing: column(preparing), ready: column(ready) };
}
