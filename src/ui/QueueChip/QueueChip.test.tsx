import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueueChip } from './QueueChip';
describe('informational queue item', () => {
  for (const status of ['preparing', 'ready'] as const)
    for (const mine of [false, true]) {
      it(
        status + ' mine=' + mine + ' preserves order text and accessible state',
        () => {
          render(<QueueChip number="007" status={status} mine={mine} />);
          const chip = screen.getByRole('group');
          expect(chip).toHaveAccessibleName(
            '007 · ' +
              (status === 'ready' ? 'Готово' : 'Готовим') +
              (mine ? ' · ваш' : ''),
          );
          expect(chip).toHaveTextContent('007');
          expect(chip).toHaveAttribute('data-mine', String(mine));
          expect(screen.queryByRole('button')).not.toBeInTheDocument();
        },
      );
    }
  it('defaults mine to false and accepts consumer classes', () => {
    render(<QueueChip number="1" status="ready" className="consumer" />);
    expect(screen.getByRole('group')).toHaveClass('consumer');
    expect(screen.getByRole('group')).toHaveAttribute('data-mine', 'false');
  });
});
