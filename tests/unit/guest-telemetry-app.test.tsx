import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardLoaded } from './support/board';
import { App } from '../../src/app/App';
import { createGuestTelemetry } from '../../src/platform/guest-telemetry';
import { createGuestEvents } from '../../src/platform/guestEvents';
import { createAnalytics } from '../../src/platform/analytics';
import { createClientReporter } from '../../src/platform/clientEvents';
import type { GuestSignals } from '../../src/platform/guest-signals';
import { orderStorage } from '../../src/storage/storage';
import fixture from '../fixtures/status-populated.json';

const send = async (body: unknown) => {
  void body;
  return { ok: true as const, data: { ok: true } };
};
function harness() {
  const tag = vi.fn<(...args: unknown[]) => void>(),
    events = vi.fn(send),
    reports = vi.fn(send);
  const analytics = createAnalytics(
    () => ({
      pathname: () => location.pathname,
      origin: 'https://example.test',
      document,
      getTag: () => tag,
      setTag: vi.fn(),
    }),
    { loadScript: false },
  );
  const telemetry = createGuestTelemetry({
    analytics,
    step: createGuestEvents(orderStorage, events),
    reporter: createClientReporter(reports),
  });
  const signals: GuestSignals = {
    permission: vi.fn(() => 'unsupported' as const),
    initialize: vi.fn(async () => {}),
    installGestureUnlock: vi.fn(() => vi.fn()),
    unlockFromGesture: vi.fn(async () => {}),
    subscribed: vi.fn(),
    ready: vi.fn(),
    rating: vi.fn(),
    requestPermissionFromGesture: vi.fn<
      GuestSignals['requestPermissionFromGesture']
    >(async (decision) => {
      decision?.('granted');
      return 'granted';
    }),
  };
  return { tag, events, telemetry, signals };
}
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
function api(claim = { ok: true, number: 112, claimToken: 'private-claim' }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input).includes('/api/status')
      ? json(fixture)
      : String(input).includes('/api/guest/claim')
        ? json(claim)
        : json({ promptDelaySec: 180, links: {} }),
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  orderStorage.forgetOrder();
  history.replaceState(null, '', '/');
});
describe('mounted telemetry integration', () => {
  it('emits one visit and successful attempt flow under StrictMode without credential parameters', async () => {
    api();
    const h = harness(),
      user = userEvent.setup(),
      subscribed = vi.spyOn(h.telemetry, 'subscribed');
    render(
      <StrictMode>
        <App signals={h.signals} telemetry={h.telemetry} />
      </StrictMode>,
    );
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '112');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    await screen.findByRole('button', { name: 'Заказ 112, Готовим' });
    const names = h.events.mock.calls.map(
      ([body]) => (body as { step: string }).step,
    );
    expect(names.filter((name) => name === 'board_open')).toHaveLength(1);
    expect(names.filter((name) => name === 'sub_try')).toHaveLength(1);
    expect(names.filter((name) => name === 'sub_ok')).toHaveLength(1);
    expect(subscribed).toHaveBeenCalledExactlyOnceWith({
      pending: false,
      alreadyServed: false,
    });
    await waitFor(() =>
      expect(h.tag).toHaveBeenCalledWith(
        110894396,
        'reachGoal',
        'notif_granted',
      ),
    );
    expect(h.tag.mock.calls.filter((call) => call[1] === 'hit')).toHaveLength(
      2,
    );
    expect(JSON.stringify(h.events.mock.calls)).not.toContain('private-claim');
    expect(JSON.stringify(h.tag.mock.calls)).not.toContain('private-claim');
  });
  it('records invalid input as an attempt/failure, without success or permission goals', async () => {
    api();
    const h = harness(),
      user = userEvent.setup();
    render(<App signals={h.signals} telemetry={h.telemetry} />);
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '0');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    await screen.findByRole('alert');
    expect(h.tag).toHaveBeenCalledWith(110894396, 'reachGoal', 'sub_fail');
    expect(
      h.tag.mock.calls.some(
        (call) => call[2] === 'sub_ok' || call[2] === 'notif_granted',
      ),
    ).toBe(false);
  });
  it('does not report a stale ready record before a fresh board confirms it', async () => {
    api();
    const h = harness();
    history.replaceState(null, '', '/board?my=1');
    orderStorage.writeOrder({
      n: 112,
      d: fixture.date,
      seen: true,
      lastStatus: 'ready',
    });
    render(<App signals={h.signals} telemetry={h.telemetry} />);
    await waitFor(() =>
      expect(orderStorage.readOrder()?.lastStatus).toBe('preparing'),
    );
    expect(
      h.events.mock.calls.some(
        ([body]) => (body as { step: string }).step === 'ready_seen',
      ),
    ).toBe(false);
    expect(h.signals.ready).not.toHaveBeenCalled();
  });
});
