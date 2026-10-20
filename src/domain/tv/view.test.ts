import { describe, expect, it } from 'vitest';
import type { Board } from '../../api/schemas/guest';
import { tvView } from './view';

const board = (
  preparing: number[],
  ready: number[] = [],
  open: number[] = [],
): Board => ({
  date: '2026-10-20',
  now: '12:00',
  updatedAt: '',
  servedCount: 0,
  orders: [
    ...open.map((number) => ({ number, status: 'open' as const })),
    ...preparing.map((number) => ({ number, status: 'preparing' as const })),
    ...ready.map((number) => ({ number, status: 'ready' as const })),
  ].map((order) => ({
    ...order,
    acceptedAt: '',
    readyAt: null,
    servedAt: null,
  })),
});
const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + i);

describe('tvView', () => {
  it('splits the board into preparing (open included) and ready', () => {
    const view = tvView(board([108, 110], [102], [111]), false);
    expect(view.state).toBe('populated');
    expect(view.preparing).toEqual({ numbers: [111, 108, 110], more: 0 });
    expect(view.ready).toEqual({ numbers: [102], more: 0 });
  });
  it('is empty without orders and before the first answer', () => {
    expect(tvView(board([]), false).state).toBe('empty');
    expect(tvView(undefined, false).state).toBe('empty');
  });
  it('switches to the overflow grid above six numbers in a column', () => {
    expect(tvView(board(range(1, 6), range(50, 6)), false).state).toBe(
      'populated',
    );
    expect(tvView(board(range(1, 7)), false).state).toBe('overflow');
    expect(tvView(board([1], range(50, 7)), false).state).toBe('overflow');
  });
  it('keeps twelve numbers and folds the rest into «+N»', () => {
    const full = tvView(board(range(1, 12)), false);
    expect(full.preparing).toEqual({ numbers: range(1, 12), more: 0 });
    const over = tvView(board(range(1, 19), range(50, 13)), false);
    expect(over.preparing).toEqual({ numbers: range(1, 11), more: 8 });
    expect(over.ready).toEqual({ numbers: range(50, 11), more: 2 });
  });
  it('never shows retained numbers while offline', () => {
    expect(tvView(board([108], [102]), true)).toEqual({
      state: 'no-connection',
      preparing: { numbers: [], more: 0 },
      ready: { numbers: [], more: 0 },
    });
  });
});
