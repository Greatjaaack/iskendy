import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HeaderMobile, HeaderDesktop, safeMapsHref } from './Header';
beforeEach(() => history.replaceState(null, '', '/'));
describe('guest headers', () => {
  it('reuses the brand and exposes a secure provided maps link', () => {
    render(
      <HeaderMobile
        mapsHref="https://example.test/yandex"
        className="consumer"
      />,
    );
    expect(screen.getByRole('link', { name: 'Искенди' })).toHaveAttribute(
      'href',
      '/',
    );
    const maps = screen.getByRole('link', { name: 'Адрес · Яндекс Карты' });
    expect(maps).toHaveAttribute('href', 'https://example.test/yandex');
    expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
    expect(maps).toHaveAttribute('target', '_blank');
  });
  it.each([
    undefined,
    '',
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://example.test',
    '/relative',
    'https://user:password@example.test',
  ])('hides invalid/missing map destinations %s', (mapsHref) => {
    render(<HeaderMobile mapsHref={mapsHref} />);
    expect(
      screen.queryByRole('link', { name: 'Адрес · Яндекс Карты' }),
    ).not.toBeInTheDocument();
    expect(safeMapsHref(mapsHref)).toBeUndefined();
  });
  it('reuses navigation for a dynamic desktop order', () => {
    render(<HeaderDesktop active="board" number="007" />);
    expect(screen.getByRole('link', { name: 'Табло' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Заказ 007' })).toHaveAttribute(
      'href',
      '/board?my=1',
    );
  });
  it('supports a desktop header without an active section', () => {
    render(<HeaderDesktop active="none" number="112" />);
    expect(
      screen.getAllByRole('link').some((e) => e.hasAttribute('aria-current')),
    ).toBe(false);
  });
});
