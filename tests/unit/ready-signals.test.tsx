import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { orderStorage } from '../../src/storage/storage';
import boardFixture from '../fixtures/status-populated.json';
import { fakeSignals } from './support/signals';

const day = boardFixture.date;
const record = (n: number, lastStatus = 'preparing') => ({
  n,
  d: day,
  seen: true,
  lastStatus,
  subAt: 1,
});
function seed(records: ReturnType<typeof record>[], selected?: number) {
  records.forEach((r, index) =>
    localStorage.setItem(
      'iskendy_orders_v1:test' + index,
      JSON.stringify({ sequence: index + 1, kind: 'add', record: r }),
    ),
  );
  if (selected)
    sessionStorage.setItem(
      'iskendy_selected_order_v1',
      JSON.stringify({ n: selected, d: day }),
    );
}
function serve(ready: number[]) {
  const board = {
    ...boardFixture,
    orders: [
      ...boardFixture.orders.filter((o) => ![112, 128].includes(o.number)),
      { ...boardFixture.orders[0], number: 112, status: 'preparing' },
      { ...boardFixture.orders[0], number: 128, status: 'preparing' },
    ].map((o) => (ready.includes(o.number) ? { ...o, status: 'ready' } : o)),
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).includes('/api/status')
            ? board
            : { promptDelaySec: 180, links: {} },
        ),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  orderStorage.forgetOrder();
  history.replaceState(null, '', '/board?my=1');
});

describe('ready toast and root navigation, approved 15 October', () => {
  it('announces a ready order and can be dismissed without changing selection', async () => {
    seed([record(112), record(128)], 112);
    serve([128]);
    const user = userEvent.setup();
    render(<App signals={fakeSignals()} />);
    const toast = await screen.findByRole('button', {
      name: /^Заказ 128 готов/,
    });
    expect(
      screen.getByRole('button', { name: 'Заказ 112, Готовим' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(toast).not.toBeInTheDocument();
  });
  it('opens the exact ready order in nested details without the dock', async () => {
    seed([record(112), record(128)], 112);
    serve([128]);
    const user = userEvent.setup();
    render(<App signals={fakeSignals()} />);
    await user.click(
      await screen.findByRole('button', { name: /^Заказ 128 готов/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Заказ 128' }),
    ).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('dismisses a ready toast after five seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seed([record(112), record(128)], 112);
      serve([128]);
      render(<App signals={fakeSignals()} />);
      await screen.findByRole('button', { name: /^Заказ 128 готов/ });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(
        screen.queryByRole('button', { name: /^Заказ 128 готов/ }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['queue', 'help'])(
    'uses root navigation instead of the retired return bar on %s',
    async (view) => {
      history.replaceState(null, '', '/board?view=' + view);
      seed([record(112)]);
      serve([]);
      render(<App signals={fakeSignals()} />);
      expect(
        await screen.findByRole('navigation', { name: 'Основная навигация' }),
      ).toBeVisible();
      expect(
        screen.getAllByRole('link', { name: 'Мои заказы' }).at(-1),
      ).toHaveAttribute('href', '/board?my=1');
      expect(screen.queryByRole('link', { name: /^К моему/ })).toBeNull();
    },
  );
  it.each(['unsupported', 'granted', 'denied'] as const)(
    'keeps the cooking instruction readable with %s notifications',
    async (permission) => {
      seed([record(112)]);
      serve([]);
      const signals = fakeSignals();
      vi.mocked(signals.permission).mockReturnValue(permission);
      render(<App signals={signals} />);
      expect(
        await screen.findByRole('button', { name: 'Заказ 112, Готовим' }),
      ).toHaveTextContent('Забрать на кассе');
    },
  );
});
