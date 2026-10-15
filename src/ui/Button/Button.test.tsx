import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, buttonVariants } from './Button';
describe('Figma Button interaction', () => {
  it.each(buttonVariants)(
    'activates %s with keyboard and defaults to non-submit',
    async (variant) => {
      const action = vi.fn();
      render(<Button variant={variant} onClick={action} />);
      const button = screen.getByRole('button', { name: 'Отслеживать' });
      expect(button).toHaveAttribute('type', 'button');
      const user = userEvent.setup();
      await user.tab();
      expect(button).toHaveFocus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(action).toHaveBeenCalledTimes(2);
    },
  );
  it.each(buttonVariants)('blocks %s when disabled', async (variant) => {
    const action = vi.fn();
    render(<Button variant={variant} disabled onClick={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Отслеживать' }));
    expect(action).not.toHaveBeenCalled();
  });
  it.each(buttonVariants)(
    'preserves %s action name while loading and blocks repeat submission',
    async (variant) => {
      const action = vi.fn();
      render(
        <Button
          label="Продолжить"
          variant={variant}
          state="loading"
          onClick={action}
        />,
      );
      const button = screen.getByRole('button', { name: 'Продолжить' });
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(
        variant === 'primary' ? 'Ищем заказ…' : 'Проверяем…',
      );
      await userEvent.click(button);
      expect(action).not.toHaveBeenCalled();
    },
  );
  it('supports form submission and a centered primary action without a decorative circle', () => {
    const { container } = render(<Button type="submit" className="consumer" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button')).toHaveClass('consumer');
    expect(container.querySelector('[class*=knob]')).not.toBeInTheDocument();
  });
  it('honours the disabled Figma state and restores the action after loading', () => {
    const { rerender } = render(<Button state="disabled" />);
    expect(screen.getByRole('button')).toBeDisabled();
    rerender(<Button state="loading" />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    rerender(<Button />);
    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });
});
