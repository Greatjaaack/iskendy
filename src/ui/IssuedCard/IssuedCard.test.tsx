import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IssuedCard } from './IssuedCard';
describe('issued card entry and public review', () => {
  it.each([false, true])(
    'offers an explicit keyboard rating trigger, desktop=%s',
    async (desktop) => {
      const rate = vi.fn();
      render(<IssuedCard number={112} desktop={desktop} onRate={rate} />);
      expect(
        screen.getByRole('heading', {
          name: 'Как вам заказ?',
          level: desktop ? 1 : 2,
        }),
      ).toBeVisible();
      const button = screen.getByRole('button', { name: 'Оценить заказ' });
      button.focus();
      await userEvent.keyboard('{Enter}');
      expect(rate).toHaveBeenCalledOnce();
      expect(
        screen.getByText('Оцените эмоцией — это займёт секунду.'),
      ).toBeVisible();
    },
  );
  it.each([false, true])(
    'never offers the Maps review on «Выдан», desktop=%s (ADR-014, 12.10)',
    (desktop) => {
      render(<IssuedCard number={998} desktop={desktop} onRate={vi.fn()} />);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByText(/Яндекс/)).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Оценить заказ' }),
      ).toBeEnabled();
    },
  );
});
describe('faces open the rating with that emotion (UX-16, 681:24758)', () => {
  it('passes the tapped emotion and none for «Оценить заказ»', async () => {
    const rate = vi.fn();
    render(<IssuedCard number={112} onRate={rate} />);
    const group = screen.getByRole('group', { name: 'Как вам заказ?' });
    expect(group.querySelectorAll('button')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Грусть' }));
    expect(rate).toHaveBeenLastCalledWith(2);
    await userEvent.click(
      screen.getByRole('button', { name: 'Оценить заказ' }),
    );
    expect(rate).toHaveBeenLastCalledWith();
  });
});
