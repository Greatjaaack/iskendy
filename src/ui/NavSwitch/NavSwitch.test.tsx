import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLocation } from '../../app/router';
import { NavSwitch } from './NavSwitch';
function Location() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname + l.search}</output>;
}
beforeEach(() => history.replaceState(null, '', '/'));
describe('guest section navigation', () => {
  it('uses only supported routes, keeps a dynamic badge and keyboard navigation', async () => {
    render(
      <>
        <NavSwitch active="order" number="007" className="consumer" />
        <Location />
      </>,
    );
    expect(screen.getByRole('navigation')).toHaveClass('consumer');
    expect(screen.getByRole('link', { name: 'Заказ 007' })).toHaveAttribute(
      'href',
      '/board?my=1',
    );
    expect(screen.getByRole('link', { name: 'Заказ 007' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Табло' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/board?view=queue',
    );
    await user.click(screen.getByRole('link', { name: 'Помощь' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/board?view=help',
    );
  });
  it('supports entry without a subscription and no selected section', () => {
    const { rerender } = render(
      <>
        <NavSwitch active="order" />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Мой заказ' })).toHaveAttribute(
      'href',
      '/',
    );
    rerender(
      <>
        <NavSwitch active="none" number="112" />
      </>,
    );
    expect(
      screen.getAllByRole('link').some((e) => e.hasAttribute('aria-current')),
    ).toBe(false);
  });
});
