import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Dock } from './Dock';
beforeEach(() => history.replaceState(null, '', '/'));
describe('compact dock ready badge (UX-15, 706:33398)', () => {
  it.each([true, false])(
    'marks «Мои заказы» while an order is ready: %s',
    (ready) => {
      render(<Dock collection active="board" ready={ready} />);
      const tab = screen.getByRole('link', { name: /^Мои заказы/ });
      expect(tab).toHaveAccessibleName(
        ready ? 'Мои заказы, готово' : 'Мои заказы',
      );
    },
  );
});
