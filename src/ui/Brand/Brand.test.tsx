import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';
import { Rosette } from './Rosette';
describe('original Figma brand assets', () => {
  it('preserves the source dimensions and distinct tone assets', () => {
    const { rerender } = render(<Logo />);
    const light = screen
      .getByRole('img', { name: 'Искенди' })
      .getAttribute('src');
    expect(screen.getByRole('img')).toHaveAttribute('width', '600');
    expect(screen.getByRole('img')).toHaveAttribute('height', '82.8533');
    rerender(<Logo tone="on-dark" />);
    expect(screen.getByRole('img').getAttribute('src')).not.toBe(light);
  });
  it('supports decorative logos without duplicate announcements', () => {
    const { container } = render(<Logo decorative className="consumer" />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass('consumer');
  });
  it('preserves the decorative rosette with no announcement', () => {
    const { container } = render(<Rosette />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('width', '100');
    expect(container.querySelector('img')).toHaveAttribute('height', '101.333');
  });
});
