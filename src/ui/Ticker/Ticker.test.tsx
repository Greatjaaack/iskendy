import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Ticker } from './Ticker';
import { tickerContent } from '../../content/ticker';
it('keeps all author messages in one focusable static cycle, without duplicate announcements', () => {
  render(<Ticker />);
  for (const text of Object.values(tickerContent))
    expect(screen.getAllByText(text, { exact: false })).toHaveLength(1);
  expect(screen.getByRole('region', { name: 'Ticker' })).toHaveAttribute(
    'tabindex',
    '0',
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByTestId('ticker').querySelectorAll('img')).toHaveLength(6);
});

it('supports bounded keyboard scrolling without animation or hijacking Tab', () => {
  render(<Ticker />);
  const host = screen.getByTestId('ticker');
  Object.defineProperties(host, {
    scrollWidth: { value: 2000 },
    clientWidth: { value: 1000 },
  });
  fireEvent.keyDown(host, { key: 'ArrowRight' });
  expect(host.scrollLeft).toBe(100);
  fireEvent.keyDown(host, { key: 'End' });
  expect(host.scrollLeft).toBe(1000);
  fireEvent.keyDown(host, { key: 'ArrowRight' });
  expect(host.scrollLeft).toBe(1000);
  fireEvent.keyDown(host, { key: 'ArrowLeft' });
  expect(host.scrollLeft).toBe(900);
  fireEvent.keyDown(host, { key: 'Home' });
  expect(host.scrollLeft).toBe(0);
  fireEvent.keyDown(host, { key: 'ArrowLeft' });
  expect(host.scrollLeft).toBe(0);
  fireEvent.keyDown(host, { key: 'End', ctrlKey: true });
  expect(host.scrollLeft).toBe(0);
  expect(fireEvent.keyDown(host, { key: 'Tab' })).toBe(true);
});
