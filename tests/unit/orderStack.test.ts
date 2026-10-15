import { describe, expect, it } from 'vitest';
import { arrangeStack, stripStatus } from '../../src/domain/order/stack';
import type { OrderState } from '../../src/domain/order/machine';
import type { OrderRecord } from '../../src/storage/schemas';

const order = (n: number): OrderRecord => ({ n, d: '2026-10-13' });
const id = (record: OrderRecord) => ({ n: record.n, d: record.d });

describe('strip status (Web/OrderStrip 664:23494)', () => {
  it.each<[OrderState, string | undefined, string]>([
    ['pending', undefined, 'waiting'],
    ['notFound', undefined, 'notfound'],
    ['preparing', undefined, 'preparing'],
    ['checking', 'preparing', 'preparing'],
    ['checking', 'ready', 'ready'],
    ['ready', undefined, 'ready'],
    ['issued', undefined, 'issued'],
    ['rated', undefined, 'rated'],
  ])('%s (last %s) → %s', (state, last, expected) => {
    expect(stripStatus(state, { ...order(1), lastStatus: last })).toBe(
      expected,
    );
  });
});

describe('stack arrangement (variant A)', () => {
  const [a, b, c, d] = [order(101), order(102), order(108), order(117)];
  const states = new Map<number, OrderState>([
    [101, 'rated'],
    [102, 'ready'],
    [108, 'preparing'],
    [117, 'pending'],
  ]);
  const state = (record: OrderRecord) => states.get(record.n)!;

  it('opens the most urgent order when nothing is selected', () => {
    const stack = arrangeStack([a, b, c, d], state, null);
    expect(stack.open?.n).toBe(102);
    expect(stack.active.map((s) => s.record.n)).toEqual([108, 117]);
    expect(stack.completed.map((s) => s.record.n)).toEqual([101]);
  });
  it('keeps the selected order open and strips in insertion order', () => {
    const stack = arrangeStack([a, b, c, d], state, id(d));
    expect(stack.open?.n).toBe(117);
    expect(stack.active.map((s) => [s.record.n, s.status])).toEqual([
      [102, 'ready'],
      [108, 'preparing'],
    ]);
  });
  it('opens a completed order when it is selected and leaves it out of the group', () => {
    const stack = arrangeStack([a, b], state, id(a));
    expect(stack.open?.n).toBe(101);
    expect(stack.completed).toEqual([]);
  });
  it('falls back to the most urgent when the selection is not in today’s orders', () => {
    expect(
      arrangeStack([a, c], state, { n: 999, d: '2026-10-13' }).open?.n,
    ).toBe(108);
  });
  it('opens the latest completed order when nothing is active', () => {
    const issued = order(95);
    const s = (r: OrderRecord) =>
      (r.n === 95 ? 'issued' : 'rated') as OrderState;
    expect(arrangeStack([a, issued], s, null).open?.n).toBe(95);
  });
  it('is empty without orders', () => {
    expect(arrangeStack([], state, null)).toEqual({
      open: null,
      active: [],
      completed: [],
    });
  });
});
