import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardLoaded } from './support/board';
import { App } from '../../src/app/App';
import type { GuestSignals } from '../../src/platform/guest-signals';
import type { NotificationState } from '../../src/platform/notifications';
import { orderStorage } from '../../src/storage/storage';
import board from '../fixtures/status-populated.json';
function signals(permission: NotificationState = 'granted'): GuestSignals {
  return {
    permission: vi.fn(() => 'unsupported' as const),
    initialize: vi.fn(async () => {}),
    installGestureUnlock: vi.fn(() => vi.fn()),
    unlockFromGesture: vi.fn(async () => {}),
    requestPermissionFromGesture: vi.fn(async () => permission),
    subscribed: vi.fn(),
    ready: vi.fn(),
    rating: vi.fn(),
  };
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function mockApi(
  claim: () => Promise<Response> = async () =>
    response({ ok: true, number: 112, claimToken: 'synthetic' }),
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      String(input).includes('/api/status')
        ? response(board)
        : String(input).includes('/api/guest/claim')
          ? claim()
          : response({ promptDelaySec: 180, links: {} }),
    );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  orderStorage.forgetOrder();
  history.replaceState(null, '', '/');
});
async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  number = '112',
) {
  await boardLoaded();
  await user.type(screen.getByLabelText('Номер заказа'), number);
  await user.click(screen.getByRole('button', { name: 'Показать статус' }));
}
describe('permission is a successful, current subscription continuation', () => {
  it.each(['granted', 'denied', 'unsupported'] as const)(
    'subscribes and keeps the order working when notifications are %s',
    async (permission) => {
      const s = signals(permission),
        user = userEvent.setup();
      mockApi();
      render(<App signals={s} />);
      expect(s.requestPermissionFromGesture).not.toHaveBeenCalled();
      await fillAndSubmit(user);
      await screen.findByRole('button', { name: 'Заказ 112, Готовим' });
      expect(s.subscribed).toHaveBeenCalledOnce();
      expect(s.requestPermissionFromGesture).toHaveBeenCalledOnce();
      expect(s.unlockFromGesture).toHaveBeenCalled();
    },
  );
  it('never prompts while the claim is pending, and prompts only after storage succeeds', async () => {
    let finish!: (value: Response) => void;
    const s = signals(),
      user = userEvent.setup();
    mockApi(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<App signals={s} />);
    await fillAndSubmit(user);
    expect(s.requestPermissionFromGesture).not.toHaveBeenCalled();
    vi.mocked(s.requestPermissionFromGesture).mockImplementation(async () => {
      expect(orderStorage.readOrder()?.n).toBe(112);
      return 'granted';
    });
    await act(async () => {
      finish(response({ ok: true, number: 112, claimToken: 'synthetic' }));
    });
    await waitFor(() =>
      expect(s.requestPermissionFromGesture).toHaveBeenCalledOnce(),
    );
  });
  it.each([
    ['taken', 200],
    ['rate limit', 429],
  ] as const)('does not prompt on %s', async (reason, status) => {
    const s = signals(),
      user = userEvent.setup();
    mockApi(async () =>
      response(
        status === 429
          ? { detail: reason }
          : { ok: false, reason: 'taken', message: reason },
        status,
      ),
    );
    render(<App signals={s} />);
    await fillAndSubmit(user);
    // 429 is a neutral hall-wide note (UX-05), not a field error.
    if (status === 429)
      await screen.findByText(
        'Много гостей сразу — нажмите ещё раз через минуту',
      );
    else await screen.findByRole('alert');
    expect(s.requestPermissionFromGesture).not.toHaveBeenCalled();
    expect(s.subscribed).not.toHaveBeenCalled();
  });
  it('does not prompt on invalid input', async () => {
    const s = signals(),
      user = userEvent.setup();
    mockApi();
    render(<App signals={s} />);
    await fillAndSubmit(user, '0');
    await screen.findByRole('alert');
    expect(s.requestPermissionFromGesture).not.toHaveBeenCalled();
  });
  it('discards a late claim after navigation instead of stealing focus or opening permission UI', async () => {
    let finish!: (value: Response) => void;
    const s = signals(),
      user = userEvent.setup();
    mockApi(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<App signals={s} />);
    await fillAndSubmit(user);
    await user.click(screen.getAllByRole('link', { name: 'Помощь' }).at(-1)!);
    await act(async () => {
      finish(response({ ok: true, number: 112, claimToken: 'late' }));
    });
    expect(location.search).toBe('?view=help');
    expect(orderStorage.readOrder()).toBeNull();
    expect(s.requestPermissionFromGesture).not.toHaveBeenCalled();
  });
  it('does not undo a successful subscription when the permission API rejects', async () => {
    const s = signals(),
      user = userEvent.setup();
    vi.mocked(s.requestPermissionFromGesture).mockRejectedValue(
      new Error('unsupported'),
    );
    mockApi();
    render(<App signals={s} />);
    await fillAndSubmit(user);
    await screen.findByRole('button', { name: 'Заказ 112, Готовим' });
    expect(orderStorage.readOrder()?.n).toBe(112);
  });
});

it('deduplicates immediate repeated submits while claim is in flight', async () => {
  let finish!: (value: Response) => void;
  const s = signals(),
    user = userEvent.setup(),
    calls = mockApi(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  render(<App signals={s} />);
  await fillAndSubmit(user);
  const form = screen.getByLabelText('Номер заказа').closest('form')!;
  await act(async () => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  expect(
    calls.mock.calls.filter(([url]) => String(url).includes('/claim')),
  ).toHaveLength(1);
  await act(async () => {
    finish(response({ ok: true, number: 112, claimToken: 'synthetic' }));
  });
  await waitFor(() =>
    expect(s.requestPermissionFromGesture).toHaveBeenCalledOnce(),
  );
});

it('does not ask for notification permission for an already-rated order', async () => {
  const s = signals(),
    user = userEvent.setup();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      String(input).includes('/api/status')
        ? response(board)
        : String(input).includes('/api/feedback/check')
          ? response({
              ok: false,
              reason: 'already',
              message: 'Спасибо, отзыв по этому заказу уже принят',
            })
          : response({ promptDelaySec: 180, links: {} }),
    );
  render(<App signals={s} />);
  await fillAndSubmit(user, '997');
  await screen.findByRole('button', { name: 'Заказ 997, Выдан' });
  expect(orderStorage.readOrder()).toMatchObject({
    n: 997,
    rated: true,
    done: true,
  });
  expect(s.requestPermissionFromGesture).not.toHaveBeenCalled();
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/claim'))).toBe(
    false,
  );
});

it('keeps the documented no-key subscription after a claim network failure', async () => {
  const s = signals(),
    user = userEvent.setup();
  mockApi(async () => {
    throw new TypeError('Failed to fetch');
  });
  render(<App signals={s} />);
  await fillAndSubmit(user);
  await screen.findByRole('button', { name: 'Заказ 112, Готовим' });
  expect(orderStorage.readOrder()).toMatchObject({ n: 112, claim: '' });
  expect(s.requestPermissionFromGesture).toHaveBeenCalledOnce();
});
