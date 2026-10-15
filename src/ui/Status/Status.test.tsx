import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Status } from './Status';
import { statusContent } from '../../content/status';
describe('Status live updates', () => {
  it.each(['preparing', 'ready', 'not-found', 'offline'] as const)(
    'announces %s with text and a decorative symbol',
    (status) => {
      const { container } = render(<Status status={status} />);
      expect(screen.getByRole('status')).toHaveTextContent(
        statusContent[status].label,
      );
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
      expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
        statusContent[status].symbol,
      );
    },
  );
  it('updates one stable live region without introducing focus targets', () => {
    const { rerender } = render(<Status className="consumer" />);
    const region = screen.getByRole('status');
    rerender(<Status status="ready" className="consumer" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveClass('consumer');
    expect(region).not.toHaveAttribute('tabindex');
  });
});
