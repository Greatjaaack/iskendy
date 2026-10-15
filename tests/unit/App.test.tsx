import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardLoaded } from './support/board';
import { App } from '../../src/app/App';
import status from '../fixtures/status-populated.json';
import config from '../fixtures/config-links.json';
import { orderStorage } from '../../src/storage/storage';
function api(
  claim: unknown = { ok: true, claimToken: 'synthetic-claim', number: 112 },
  claimStatus = 200,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input),
      body = path.includes('/api/status')
        ? status
        : path.includes('/api/feedback/config')
          ? config
          : path.includes('/api/guest/claim')
            ? claim
            : { ok: false, reason: 'not_served' };
    return new Response(JSON.stringify(body), {
      status: path.includes('/api/guest/claim') ? claimStatus : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  orderStorage.forgetOrder();
});
describe('Figma guest entry', () => {
  it('shows only the number field before a claim, with no background claims or staff storage access (Q-14)', async () => {
    const fetch = api(),
      read = vi.spyOn(Storage.prototype, 'getItem'),
      write = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Где мой заказ?',
    );
    await boardLoaded();
    expect(screen.queryByText('№', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Сейчас на кухне')).not.toBeInTheDocument();
    expect(screen.queryByText('108 · 110 · 111 · 112 · 113 · 114')).toBeNull();
    expect(screen.queryByRole('link', { name: /Табло/ })).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('/claim')),
    ).toBe(false);
    expect(read.mock.calls.some(([key]) => key === 'iskendy_staff_token')).toBe(
      false,
    );
    expect(
      write.mock.calls.every(
        ([key]) => key === 'iskendy_guest' || key === 'iskendy_visit',
      ),
    ).toBe(true);
  });
  it('claims only on explicit submit, preserves storage and navigates to own order', async () => {
    const fetch = api(),
      user = userEvent.setup();
    render(<App />);
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '112');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    await screen.findByRole('button', { name: 'Заказ 112, Готовим' });
    // SEC-02: the address carries no order number or date.
    expect(location.pathname + location.search).toBe('/board?my=1');
    expect(orderStorage.readOrder()).toMatchObject({
      n: 112,
      d: status.date,
      claim: 'synthetic-claim',
      seen: true,
    });
    expect(
      fetch.mock.calls.filter(([url]) => String(url).includes('/claim')),
    ).toHaveLength(1);
  });
  it('retains input and displays a business error without retry or stored subscription', async () => {
    const fetch = api({
        ok: false,
        reason: 'taken',
        message: 'Этот номер уже отслеживают с другого телефона',
      }),
      user = userEvent.setup();
    render(<App />);
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '112');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот номер уже отслеживают с другого телефона',
    );
    expect(screen.getByLabelText('Номер заказа')).toHaveValue('112');
    expect(orderStorage.readOrder()).toBeNull();
    expect(
      fetch.mock.calls.filter(([url]) => String(url).includes('/claim')),
    ).toHaveLength(1);
  });
  it('does not retry 429 and retains the entered number', async () => {
    const fetch = api({ detail: 'Too many requests' }, 429),
      user = userEvent.setup();
    render(<App />);
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '112');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    // UX-05: the shared hall limit is not the guest's mistake — neutral note, valid field.
    expect(
      await screen.findByText(
        'Много гостей сразу — нажмите ещё раз через минуту',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Номер заказа')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Номер заказа')).toHaveValue('112');
    expect(orderStorage.readOrder()).toBeNull();
    expect(
      fetch.mock.calls.filter(([url]) => String(url).includes('/claim')),
    ).toHaveLength(1);
  });
  it('rejects invalid input without contacting claim endpoint', async () => {
    const fetch = api(),
      user = userEvent.setup();
    render(<App />);
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '0');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    await screen.findByRole('alert');
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('/claim')),
    ).toBe(false);
  });
  it('restores own order in the queue without automatic claims', async () => {
    const fetch = api();
    orderStorage.writeOrder({
      n: 112,
      d: status.date,
      seen: true,
      subAt: Date.now(),
      claim: 'synthetic-existing',
      servedAt: 0,
      rated: false,
      done: false,
      lastStatus: 'preparing',
    });
    history.replaceState(null, '', '/board?view=queue');
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: '112 · Готовим · ваш' }),
      ).toBeInTheDocument(),
    );
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('/claim')),
    ).toBe(false);
  });
});
describe('another tab adds an order while this one is typing', () => {
  it('keeps the number field until this tab submits', async () => {
    api({ ok: true, claimToken: 'synthetic-claim', number: 110 });
    const user = userEvent.setup();
    render(<App />);
    await boardLoaded();
    await user.type(screen.getByLabelText('Номер заказа'), '110');
    // The other tab's journal write arrives as a storage event.
    const key = 'iskendy_orders_v1:other-tab';
    const value = JSON.stringify({
      sequence: 1,
      kind: 'add',
      record: { n: 112, d: status.date, seen: true, lastStatus: 'preparing' },
    });
    localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
    expect(screen.getByLabelText('Номер заказа')).toHaveValue('110');
    await user.click(screen.getByRole('button', { name: 'Показать статус' }));
    expect(
      await screen.findByRole('button', { name: 'Заказ 110, Готовим' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Заказ 112, Готовим' }),
    ).toBeVisible();
  });
});
describe('receipt QR (UX-22)', () => {
  it.each(['/board', '/board?utm_source=receipt'])(
    'opens the number field on %s like /, not the queue',
    async (path) => {
      api();
      history.replaceState(null, '', path);
      render(<App />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Где мой заказ?',
      );
      expect(
        screen.getByLabelText('Номер заказа', { exact: true }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Табло заказов' }),
      ).not.toBeInTheDocument();
    },
  );
});
describe('document title', () => {
  it('names the screen even when the rating query skips route focus', async () => {
    api();
    document.title = 'stale';
    history.replaceState(null, '', '/board?my=1&rate=1');
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.title).toMatch(/ · Искенди$/));
  });
});
describe('entry submit label', () => {
  it('names the subscribe action the same on every width (FIG-13)', async () => {
    api();
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    const submits = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('type') === 'submit');
    expect(submits.length).toBeGreaterThan(0);
    for (const b of submits) expect(b).toHaveAccessibleName('Показать статус');
  });
});
