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
it('shows all 24 overflow numbers and folds a longer tail into «+N»', () => {
  const preparing = Array.from({ length: 12 }, (_, i) => 201 + i);
  const ready = Array.from({ length: 12 }, (_, i) => 213 + i);
  const view = render(
    <TvBoard state="overflow" preparing={preparing} ready={ready} />,
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(24);
  expect(screen.getByText('224')).toBeVisible();
  view.unmount();
  render(
    <TvBoard
      state="overflow"
      preparing={preparing.slice(0, 11)}
      preparingMore={3}
      ready={ready}
    />,
  );
  const column = within(screen.getByRole('region', { name: 'Готовим' }));
  expect(column.getAllByRole('listitem')).toHaveLength(12);
  expect(column.getByLabelText(/ещё 3/)).toHaveTextContent('+3');
});
it('refuses a column that does not fit instead of cutting it silently', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const twelve = Array.from({ length: 12 }, (_, i) => 201 + i);
  expect(() =>
    render(<TvBoard state="overflow" preparing={twelve} preparingMore={1} />),
  ).toThrow(/capacity/);
  error.mockRestore();
});
it('shows the empty message in a column without numbers', () => {
  render(<TvBoard state="populated" preparing={[108]} />);
  expect(
    within(screen.getByRole('region', { name: 'Готово' })).getByText(
      'Скоро будет вкусно',
    ),
  ).toBeVisible();
  expect(screen.getByText('108')).toBeVisible();
});
it('shows the QR to /board only when given, with the confirmed address', () => {
  const view = render(<TvBoard state="empty" />);
  expect(screen.queryByRole('img', { name: /QR/ })).not.toBeInTheDocument();
  view.unmount();
  render(<TvBoard state="empty" qrSrc="/api/qr?data=x" />);
  expect(screen.getByRole('img', { name: /QR/ })).toHaveAttribute(
    'src',
    '/api/qr?data=x',
  );
  expect(screen.getByText(/Следите за заказом в/)).toBeVisible();
  expect(
    screen.queryByText('Следите за номером заказа'),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Новослободская/)).toBeVisible();
  expect(screen.queryByText(/Плещеева/)).not.toBeInTheDocument();
});
