import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Link, useLocation, useNavigate } from './router';
function Where() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output>{pathname + search}</output>
      <button onClick={() => navigate('/board?view=help')}>push</button>
      <button onClick={() => navigate('/', { replace: true })}>replace</button>
      <Link to="/board?view=queue" className="c">
        board
      </Link>
    </>
  );
}
beforeEach(() => history.replaceState(null, '', '/board?my=1'));
describe('own router (ADR-020)', () => {
  it('reads the address and pushes or replaces history entries', () => {
    render(<Where />);
    expect(screen.getByRole('status')).toHaveTextContent('/board?my=1');
    const length = history.length;
    fireEvent.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.getByRole('status')).toHaveTextContent('/board?view=help');
    expect(history.length).toBe(length + 1);
    fireEvent.click(screen.getByRole('button', { name: 'replace' }));
    expect(screen.getByRole('status')).toHaveTextContent('/');
    expect(location.pathname + location.search).toBe('/');
    expect(history.length).toBe(length + 1);
  });
  it('follows browser back and forward', () => {
    render(<Where />);
    act(() => {
      history.pushState(null, '', '/board?view=queue');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('/board?view=queue');
  });
  it('routes plain clicks in-app and leaves modified clicks to the browser', () => {
    render(<Where />);
    const link = screen.getByRole('link', { name: 'board' });
    expect(link).toHaveAttribute('href', '/board?view=queue');
    expect(link).toHaveClass('c');
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('/board?my=1');
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('/board?view=queue');
  });
});
