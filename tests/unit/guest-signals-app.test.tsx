import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { fakeSignals } from './support/signals';
import { orderStorage } from '../../src/storage/storage';
import boardFixture from '../fixtures/status-populated.json';

function readyBoard() {
  return {
    ...boardFixture,
    orders: boardFixture.orders.map((order) =>
      order.number === 112 ? { ...order, status: 'ready' } : order,
    ),
  };
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  orderStorage.forgetOrder();
  history.replaceState(null, '', '/board?my=1');
});
describe('ready signals in the mounted guest app', () => {
  it('emits one signal under StrictMode and exposes the own-order live status', async () => {
    const signals = fakeSignals();
    orderStorage.writeOrder({
      n: 112,
      d: boardFixture.date,
      seen: true,
      lastStatus: 'preparing',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes('/api/status')
              ? readyBoard()
              : { promptDelaySec: 180, links: {} },
          ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    render(
      <StrictMode>
        <App signals={signals} />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(signals.ready).toHaveBeenCalledExactlyOnceWith(112),
    );
    expect(
      screen.getByRole('button', { name: 'Заказ 112, Готово' }),
    ).toHaveTextContent('Готово');
    expect(screen.getAllByRole('status')[0]).toHaveAttribute(
      'aria-live',
      'polite',
    );
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(signals.ready).toHaveBeenCalledOnce();
    expect(signals.requestPermissionFromGesture).not.toHaveBeenCalled();
  });
  it('announces readiness without navigating away from the queue', async () => {
    const signals = fakeSignals();
    history.replaceState(null, '', '/board?view=queue');
    orderStorage.writeOrder({
      n: 112,
      d: boardFixture.date,
      seen: true,
      lastStatus: 'preparing',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes('/api/status')
              ? readyBoard()
              : { promptDelaySec: 180, links: {} },
          ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    render(<App signals={signals} />);
    await waitFor(() => expect(signals.ready).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Заказ 112 готов');
    expect(location.search).toBe('?view=queue');
  });
});
