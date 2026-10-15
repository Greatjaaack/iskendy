import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GameTile } from './GameTile';
it('is an honest static Soon card, never a game link or button', () => {
  render(<GameTile />);
  const card = screen.getByRole('article', { name: 'Сыграть — Скоро' });
  expect(screen.getByText('Скоро')).toBeVisible();
  expect(card).not.toHaveAttribute('tabindex');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  // UX-06: a 'go' arrow promised a tap that does nothing; Soon has none.
  expect(card.querySelectorAll('img')).toHaveLength(7);
  expect(card.querySelector('img[src*="board-go"]')).toBeNull();
});
