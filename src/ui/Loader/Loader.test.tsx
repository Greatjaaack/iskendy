import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Loader } from './Loader';
import { buttonContent } from '../../content/button';
it('keeps source-backed loading copy and busy status without an actionable control', () => {
  render(<Loader label={buttonContent.primaryLoading} />);
  const status = screen.getByRole('status', {
    name: buttonContent.primaryLoading,
  });
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText(buttonContent.primaryLoading)).toBeVisible();
  expect(status.querySelector('img')).toHaveAttribute('alt', '');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('retains an accessible label for the exact glyph-only Figma presentation', () => {
  render(<Loader label={buttonContent.otherLoading} showLabel={false} />);
  expect(
    screen.getByRole('status', { name: buttonContent.otherLoading }),
  ).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText(buttonContent.otherLoading)).toBeInTheDocument();
});
