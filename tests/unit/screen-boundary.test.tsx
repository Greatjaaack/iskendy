import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { createGuestTelemetry } from '../../src/platform/guest-telemetry';
import { createGuestEvents } from '../../src/platform/guestEvents';
import { createAnalytics } from '../../src/platform/analytics';
import { createClientReporter } from '../../src/platform/clientEvents';
import { orderStorage } from '../../src/storage/storage';
import status from '../fixtures/status-populated.json';

// R-20261012-03: the queue screen throws on render.
vi.mock('../../src/ui/QueueGroups/QueueGroups', () => ({
  QueueGroups: () => {
    throw new Error('synthetic screen failure');
  },
}));
function telemetry() {
  const reports = vi.fn(async (body: unknown) => {
    void body;
    return { ok: true as const, data: { ok: true } };
  });
  const analytics = createAnalytics(
    () => ({
      pathname: () => location.pathname,
      origin: 'https://example.test',
      document,
      getTag: () => vi.fn<(...args: unknown[]) => void>(),
      setTag: vi.fn(),
    }),
    { loadScript: false },
  );
  return {
    reports,
    telemetry: createGuestTelemetry({
      analytics,
      step: createGuestEvents(orderStorage, vi.fn()),
      reporter: createClientReporter(reports),
    }),
  };
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  orderStorage.forgetOrder();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).includes('/api/status')
            ? status
            : { promptDelaySec: 180, links: {} },
        ),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
});
describe('screen error boundary', () => {
  it('shows the fallback on the failed screen, reports once and keeps navigation', async () => {
    history.replaceState(null, '', '/board?view=queue');
    const h = telemetry(),
      user = userEvent.setup();
    render(<App telemetry={h.telemetry} />);
    const main = screen.getByRole('main');
    expect(await within(main).findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить экран.',
    );
    expect(
      within(main).getByRole('button', { name: 'Обновить' }),
    ).toBeEnabled();
    // Header and dock live outside the screen boundary.
    const dock = screen.getAllByRole('navigation').at(-1)!;
    expect(
      h.reports.mock.calls.filter(
        ([body]) => (body as { kind: string }).kind === 'render',
      ),
    ).toHaveLength(1);
    await user.click(within(dock).getByRole('link', { name: /Помощь/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Помощь' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
