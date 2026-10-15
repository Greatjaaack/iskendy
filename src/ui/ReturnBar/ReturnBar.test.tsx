import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from '../../app/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReturnBar } from './ReturnBar';
function Location() {
  const l = useLocation();
  return <output>{l.pathname + l.search}</output>;
}
function Routed(props: Omit<Parameters<typeof ReturnBar>[0], 'onNavigate'>) {
  return <ReturnBar {...props} onNavigate={useNavigate()} />;
}
beforeEach(() => history.replaceState(null, '', '/'));
describe('return to the current guest order', () => {
  it.each(['preparing', 'ready'] as const)(
    'keeps %s and its dynamic number in the accessible link',
    async (status) => {
      render(
        <>
          <Routed number="007" status={status} className="consumer" />
          <Location />
        </>,
      );
      const link = screen.getByRole('link', {
        name:
          'К моему заказу 007 · ' + (status === 'ready' ? 'Готово' : 'Готовим'),
      });
      expect(link).toHaveAttribute('href', '/board?my=1');
      expect(link).toHaveClass('consumer');
      const user = userEvent.setup();
      await user.tab();
      expect(link).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(screen.getByRole('status')).toHaveTextContent('/board?my=1');
    },
  );
  it('names several ready orders (706:33365)', () => {
    render(<ReturnBar number="102" status="ready" ready={[102, 108]} />);
    expect(
      screen.getByRole('link', { name: 'К моим заказам · Готовы: 102, 108' }),
    ).toHaveAttribute('href', '/board?my=1');
  });
});
