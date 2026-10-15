import { render, screen, within } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { TvBoard } from './TvBoard';
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => vi.unstubAllGlobals());
it('labels statuses with words and renders every supplied number once', () => {
  render(<TvBoard state="populated" preparing={[108, 110]} ready={[102]} />);
  expect(
    within(screen.getByRole('region', { name: 'Готовим' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['108', '110']);
  expect(
    within(screen.getByRole('region', { name: 'Готово' })).getByText('102'),
  ).toBeVisible();
});
it.each(['empty', 'no-connection'] as const)(
  '%s never shows retained numbers',
  (state) => {
    render(<TvBoard state={state} preparing={[108]} ready={[102]} />);
    expect(screen.queryByText('108')).not.toBeInTheDocument();
    expect(screen.queryByText('102')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(
      screen.getByText(
        state === 'empty' ? 'Ждём ваш заказ' : 'Нет связи с кухней',
      ),
    ).toBeVisible();
  },
);
it('shows all 24 overflow numbers and refuses an unspecified truncation policy', () => {
  const preparing = Array.from({ length: 12 }, (_, i) => 201 + i);
  const ready = Array.from({ length: 12 }, (_, i) => 213 + i);
  const view = render(
    <TvBoard state="overflow" preparing={preparing} ready={ready} />,
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(24);
  expect(screen.getByText('224')).toBeVisible();
  view.unmount();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() =>
    render(
      <TvBoard
        state="overflow"
        preparing={[...preparing, 225]}
        ready={ready}
      />,
    ),
  ).toThrow(/capacity/);
  error.mockRestore();
});
