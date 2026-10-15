import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon, iconNames } from './Icon';
describe('Figma Icon', () => {
  it('hides decorative glyphs from assistive technology', () => {
    const { container } = render(<Icon name="bell" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it.each(iconNames)(
    'supports the exact %s glyph with an accessible name',
    (name) => {
      render(<Icon name={name} label={name} className="consumer" />);
      expect(screen.getByRole('img', { name })).not.toHaveAttribute(
        'aria-hidden',
      );
      expect(screen.getByRole('img', { name })).toHaveClass('consumer');
    },
  );
});
