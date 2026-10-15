import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderTicket } from './OrderTicket';
import { Steps, stageIndex } from '../Steps/Steps';
describe('OrderTicket and progress', () => {
  for (const size of ['mobile', 'desktop'] as const)
    for (const status of ['preparing', 'ready', 'issued'] as const) {
      it(
        'renders dynamic ' +
          size +
          ' ' +
          status +
          ' without placeholder order data',
        () => {
          render(
            <OrderTicket
              number="007"
              status={status}
              size={size}
              pickup="Касса"
            />,
          );
          expect(
            screen.getByRole('article', { name: 'Ваш заказ 007' }),
          ).toBeInTheDocument();
          expect(screen.queryByText('112')).not.toBeInTheDocument();
          expect(screen.getByText('007')).toBeInTheDocument();
          const current = screen
            .getAllByRole('listitem')
            .filter((e) => e.getAttribute('aria-current') === 'step');
          expect(current).toHaveLength(1);
          expect(current[0]).toHaveTextContent(
            ['Принят', 'Готовим', 'Готово', 'Выдан'][stageIndex[status]]!,
          );
        },
      );
    }
  it('shows exactly the real caller pickup and safely escapes display text', () => {
    render(<OrderTicket number="112" status="ready" pickup="<script>" />);
    expect(screen.getByText('<script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
  it('defaults standalone progress to preparing and supports consumer class', () => {
    render(<Steps className="consumer" />);
    expect(screen.getByRole('list')).toHaveClass('consumer');
    expect(screen.getAllByRole('listitem')[1]).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});
