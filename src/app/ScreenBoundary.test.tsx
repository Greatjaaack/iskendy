import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScreenBoundary } from './ScreenBoundary';

function Broken(): never {
  throw new Error('synthetic chunk failure');
}
describe('optional rating chunk recovery', () => {
  it('renders the current children normally and leaves a separate order usable after failure', async () => {
    const failure = vi.fn(),
      reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <>
        <h1>Order stays visible</h1>
        <ScreenBoundary onFailure={failure} reload={reload}>
          <p>Loaded rating</p>
        </ScreenBoundary>
      </>,
    );
    expect(screen.getByText('Loaded rating')).toBeVisible();
    expect(failure).not.toHaveBeenCalled();
    rerender(
      <>
        <h1>Order stays visible</h1>
        <ScreenBoundary onFailure={failure} reload={reload}>
          <Broken />
        </ScreenBoundary>
      </>,
    );
    expect(
      screen.getByRole('heading', { name: 'Order stays visible' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить экран.',
    );
    expect(failure).toHaveBeenCalledExactlyOnceWith();
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(reload).toHaveBeenCalledOnce();
  });
  it('does not let a reporting exception destroy the reload action', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ScreenBoundary
        onFailure={() => {
          throw new Error('report blocked');
        }}
      >
        <Broken />
      </ScreenBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить экран.',
    );
  });
  it('takes the failed screen main landmark when used around a screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ScreenBoundary screen="screen" onFailure={() => {}}>
        <Broken />
      </ScreenBoundary>,
    );
    expect(screen.getByRole('main')).toHaveClass('screen');
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('alert'),
    );
  });
});
