import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GuestExperience } from './GuestExperience';
import { GuestSignalsContext } from '../../app/guest-signals-context';
import { fakeSignals } from '../../../tests/unit/support/signals';
import { boardSchema } from '../../api/schemas/guest';
import fixture from '../../../tests/fixtures/status-populated.json';
import { BOARD_KEY } from '../../polling/BoardPoller';
import { navigate } from '../../app/router';
import photoIcon from '../../assets/review/photo.svg';

const board = boardSchema.parse(fixture),
  record = {
    n: 112,
    d: board.date,
    lastStatus: 'preparing',
    seen: true,
    subAt: 1,
  };
const base = {
  records: [record],
  selected: record,
  board,
  now: Date.now(),
  promptDelaySec: 180,
  offline: false,
  loading: false,
  failed: false,
  toast: null,
  closeToast: vi.fn(),
  rating: null,
};
function setup(overrides: Partial<Parameters<typeof GuestExperience>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  client.setQueryData(BOARD_KEY, board);
  const signals = fakeSignals();
  const view = render(
    <QueryClientProvider client={client}>
      <GuestSignalsContext value={signals}>
        <GuestExperience {...base} {...overrides} />
      </GuestSignalsContext>
    </QueryClientProvider>,
  );
  return { ...view, client, signals, user: userEvent.setup() };
}
beforeEach(() => {
  history.replaceState(null, '', '/board?my=1');
  localStorage.clear();
  sessionStorage.clear();
});
describe('approved responsive guest scenarios', () => {
  it.each([1, 2, 3, 5])(
    'shows exactly %i order cards; explicit controls appear for multiple orders',
    (count) => {
      setup({
        records: Array.from({ length: count }, (_, i) => ({
          ...record,
          n: 112 + i,
        })),
      });
      expect(
        screen.getAllByRole('button', { name: /^Заказ \d+,/ }),
      ).toHaveLength(count);
      expect(
        screen.queryByRole('group', { name: /Переключение заказов/ }) !== null,
      ).toBe(count >= 2);
    },
  );
  it('opens details with a top Back and no root navigation', async () => {
    const { user } = setup();
    await user.click(
      screen.getByRole('button', { name: 'Заказ 112, Готовим' }),
    );
    expect(screen.getByRole('heading', { name: 'Заказ 112' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeVisible();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('opens the wallet list and its add-order sheet', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Все заказы' }));
    expect(screen.getByRole('heading', { name: 'Все заказы' })).toBeVisible();
    expect(screen.queryByRole('navigation')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Добавить заказ' }));
    expect(
      await screen.findByRole('dialog', { name: 'Добавить заказ' }),
    ).toBeVisible();
  });
  it('root tab navigation is usable with keyboard', async () => {
    const { user } = setup();
    const link = within(screen.getByRole('navigation')).getByRole('link', {
      name: 'Помощь',
    });
    link.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Помощь' })).toBeVisible();
    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'Помощь',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });
  it('keeps the message anonymous, validates it, and retains files when delivery is unavailable', async () => {
    history.replaceState(null, '', '/board?view=message');
    const { user, container } = setup();
    expect(screen.getByText(/Ваше сообщение будет анонимным/)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' }),
    );
    expect(
      screen.getByText('Напишите, что случилось с заказом.'),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText('Что случилось?'),
      'Не хватает соуса',
    );
    const file = new File(['video'], 'receipt.mp4', { type: 'video/mp4' });
    await user.upload(container.querySelector('input[type=file]')!, file);
    expect(screen.getByText('receipt.mp4')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось отправить сообщение',
    );
    expect(screen.getByLabelText('Что случилось?')).toHaveValue(
      'Не хватает соуса',
    );
    expect(screen.getByText('receipt.mp4')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Удалить receipt.mp4' }),
    );
    expect(screen.queryByText('receipt.mp4')).toBeNull();
  });
  it('allows continuing a draft and confirms explicit discard', async () => {
    history.replaceState(null, '', '/board?view=message');
    const { user } = setup();
    await user.type(screen.getByLabelText('Что случилось?'), 'Черновик');
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(
      await screen.findByRole('dialog', { name: 'Выйти без отправки?' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByLabelText('Что случилось?')).toHaveValue('Черновик');
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    await user.click(
      await screen.findByRole('button', { name: 'Выйти без отправки' }),
    );
    expect(screen.getByRole('heading', { name: 'Помощь' })).toBeVisible();
  });
  it('provides a manager fallback with the message form', async () => {
    history.replaceState(null, '', '/board?view=manager');
    const { user } = setup();
    expect(screen.getByText('Нужен управляющий?')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Оставить сообщение управляющему' }),
    );
    expect(screen.getByLabelText('Номер заказа · необязательно')).toHaveValue(
      '112',
    );
  });
  it.each([0, 1, 2, 3])('opens the exact FAQ answer %i', async (topic) => {
    history.replaceState(null, '', '/board?view=help');
    const { user } = setup();
    const links = screen
      .getAllByRole('link')
      .filter((link) =>
        link.getAttribute('href')?.startsWith('/board?view=faq'),
      );
    await user.click(links[topic]!);
    expect(location.search).toBe('?view=faq&topic=' + topic);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('marks notifications read and asks browser permission only on explicit action', async () => {
    history.replaceState(null, '', '/board?view=notifications');
    const { user, signals } = setup();
    expect(screen.getByText(/Сегодня · 1 новых/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Прочитать все' }));
    expect(screen.queryByText(/1 новых/)).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Звук и уведомления' }),
    );
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(signals.requestPermissionFromGesture).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Включить уведомления' }),
    );
    expect(signals.requestPermissionFromGesture).toHaveBeenCalledOnce();
  });
  it('handles no notifications and no board orders without inventing content', () => {
    history.replaceState(null, '', '/board?view=notifications');
    setup({ records: [] });
    expect(screen.getByText('Пока нет уведомлений')).toBeVisible();
  });
  it('shows cached data with offline recovery', () => {
    setup({ offline: true });
    expect(screen.getByText('Нет интернета')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Заказ 112, Готовим' }),
    ).toBeVisible();
  });
  it('shows a glass skeleton and then an explicit initial failure', () => {
    const { unmount } = setup({ board: null, loading: true });
    expect(
      screen.getByRole('status', { name: 'Загружаем заказы' }),
    ).toHaveAttribute('aria-busy', 'true');
    unmount();
    setup({ board: null, failed: true });
    expect(screen.getByText('Не удалось загрузить заказы')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled();
  });
  it('keeps the root navigation available across help and board', async () => {
    const { user } = setup();
    await user.click(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'Табло',
      }),
    );
    expect(
      screen.getByText(/Ваши заказы обведены розовой рамкой/),
    ).toBeVisible();
  });
  it('restores the exact source route from nested navigation', async () => {
    const { user } = setup();
    navigate('/board?my=1&view=list');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Все заказы' })).toBeVisible(),
    );
    await user.click(
      screen.getByRole('button', { name: 'Заказ 112, Готовим' }),
    );
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    await waitFor(() => expect(location.search).toBe('?my=1&view=list'));
  });
  it('rejects an empty selected file without adding a ghost row', () => {
    history.replaceState(null, '', '/board?view=message');
    const { container } = setup();
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [new File([], 'empty.txt')] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось добавить файл',
    );
    expect(screen.queryByText('empty.txt')).toBeNull();
  });
  it('does not present an expired unseen number as preparing', () => {
    setup({
      records: [{ ...record, n: 999, seen: false, subAt: 1, lastStatus: '' }],
      now: Date.now(),
    });
    expect(
      screen.getByRole('heading', { name: 'Заказ не найден' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Заказ 112, Готовим' }),
    ).toBeNull();
  });
  it('keeps an unreadable image attached and falls back to its file icon', async () => {
    history.replaceState(null, '', '/board?view=message');
    const { container, user } = setup();
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['invalid-image'], 'test.png', { type: 'image/png' })],
      },
    });
    await waitFor(() =>
      expect(container.querySelector('li img')?.getAttribute('src')).toMatch(
        /^data:image\/png/,
      ),
    );
    const preview = container.querySelector('li img')!;
    fireEvent.error(preview);
    await waitFor(() => expect(preview.getAttribute('src')).toBe(photoIcon));
    expect(screen.getByText('test.png')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Удалить test.png' }));
    expect(screen.queryByText('test.png')).toBeNull();
  });
});
