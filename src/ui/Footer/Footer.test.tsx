import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';
import { InfoCard, infoCardKinds } from '../InfoCard/InfoCard';
import { SocialButton, socialKinds } from '../SocialButton/SocialButton';
import { footerContent } from '../../content/footer';
describe('safe Figma guest footer', () => {
  it.each([false, true])(
    'renders the configured native destinations and required legal copy, desktop=%s',
    async (desktop) => {
      render(
        <Footer
          desktop={desktop}
          links={{
            yandex: 'https://example.test/maps',
            telegram: 'https://example.test/telegram',
            vk: 'https://example.test/vk',
            instagram: 'https://example.test/instagram',
          }}
        />,
      );
      expect(
        screen.getByText(footerContent.legal, { normalizer: (value) => value }),
      ).toBeVisible();
      expect(screen.getAllByRole('link')).toHaveLength(5);
      expect(screen.queryByRole('img', { name: 'Искенди' })).toBe(
        desktop ? screen.getByRole('img', { name: 'Искенди' }) : null,
      );
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveAttribute('target', '_blank');
        link.focus();
        expect(link).toHaveFocus();
      }
      await userEvent.tab();
    },
  );
  it.each([
    'javascript:alert(1)',
    'https://user@example.test/maps',
    'http://example.test/maps',
    undefined,
  ])(
    'suppresses unsafe/missing actions without inventing a destination: %s',
    (href) => {
      render(
        <Footer
          links={{ yandex: href, telegram: href, vk: href, instagram: href }}
        />,
      );
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(
        screen.queryByText(footerContent.telegram.title),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(footerContent.address.title, {
          normalizer: (value) => value,
        }),
      ).toBeVisible();
      expect(screen.getByText(footerContent.hours.title)).toBeVisible();
    },
  );
  it.each(infoCardKinds)(
    'preserves InfoCard variant %s; hours remain static even with a URL',
    (kind) => {
      render(<InfoCard kind={kind} href="https://example.test/destination" />);
      expect(
        screen.getByText(footerContent[kind].title, {
          normalizer: (value) => value,
        }),
      ).toBeVisible();
      expect(screen.queryAllByRole('link')).toHaveLength(
        kind === 'hours' ? 0 : 1,
      );
    },
  );
  it.each(socialKinds)(
    'provides an accessible native social link %s',
    (kind) => {
      render(<SocialButton kind={kind} href="https://example.test/social" />);
      expect(
        screen.getByRole('link', { name: footerContent.social[kind] }),
      ).toHaveAttribute('href', 'https://example.test/social');
    },
  );
  it('shows the confirmed address and weekly hours line by line (Q-09)', () => {
    render(<Footer links={{ yandex: 'https://example.test/maps' }} />);
    expect(
      screen.getByText('Новослободская ул., 19,\u00A0стр.\u00A01', {
        normalizer: (value) => value,
      }),
    ).toBeVisible();
    for (const line of [
      'пн–чт 11:30–22:00',
      'пт 11:30–23:00',
      'сб–вс 12:00–23:00',
    ])
      expect(screen.getByText(line)).toBeVisible();
  });
  it('links the Telegram channel as a channel, not as a manager contact (Q-06)', () => {
    render(<Footer links={{ telegram: 'https://example.test/channel' }} />);
    expect(screen.getByRole('link', { name: /Наш Telegram/ })).toHaveAttribute(
      'href',
      'https://example.test/channel',
    );
    expect(screen.queryByText('Написать управляющему')).not.toBeInTheDocument();
  });
  it('marks the Instagram icon itself with the Meta asterisk (UX-09)', () => {
    render(<SocialButton kind="instagram" href="https://example.test/i" />);
    const link = screen.getByRole('link', { name: 'Instagram*' });
    const mark = link.querySelector('[aria-hidden="true"]');
    expect(mark).toHaveTextContent('*');
  });
});
