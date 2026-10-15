import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';
describe('Figma Input', () => {
  it('has a permanent label, numeric keyboard and correctly linked hint', () => {
    render(<Input value="" onValueChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'Номер заказа' });
    expect(input).toHaveAccessibleDescription('Номер в верхней части чека');
    expect(input).toHaveAttribute('placeholder', 'Например, 102');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('maxlength', '6');
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.queryByText('№', { exact: true })).not.toBeInTheDocument();
  });
  it('preserves leading zeroes and accepts four-digit receipt numbers up to the API limit', async () => {
    function Harness() {
      const [value, setValue] = useState('');
      return <Input value={value} onValueChange={setValue} />;
    }
    render(<Harness />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '05221');
    expect(input).toHaveValue('05221');
    await userEvent.type(input, '99');
    expect(input).toHaveValue('052219');
  });
  it('associates errors and preserves a comment when a request fails', () => {
    const { rerender } = render(
      <Input kind="comment" value="Мой текст" onValueChange={() => {}} />,
    );
    rerender(
      <Input
        kind="comment"
        value="Мой текст"
        onValueChange={() => {}}
        state="error"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Комментарий' });
    expect(input).toHaveValue('Мой текст');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'Не удалось отправить. Попробуйте ещё раз.',
    );
    expect(input).toHaveClass('ym-disable-keys');
    expect(input.closest('.ym-hide-content')).not.toBeNull();
  });
  it('keeps IDs distinct, labels associated and optional hints absent', () => {
    render(
      <>
        <Input value="" onValueChange={() => {}} showHint={false} />
        <Input kind="comment" value="" onValueChange={() => {}} />
      </>,
    );
    const fields = screen.getAllByRole('textbox');
    expect(fields[0]!.id).not.toBe(fields[1]!.id);
    expect(fields[0]).not.toHaveAttribute('aria-describedby');
    expect(fields[1]).toHaveAccessibleDescription('Необязательно');
  });
  it('disabled controls prevent edits and keep their labels', async () => {
    const change = vi.fn();
    render(<Input value="112" onValueChange={change} disabled />);
    const input = screen.getByRole('textbox', { name: 'Номер заказа' });
    expect(input).toBeDisabled();
    await userEvent.type(input, '1');
    expect(change).not.toHaveBeenCalled();
  });
  it('allows an explicit error message and custom ID/name', () => {
    render(
      <Input
        id="my-order"
        name="order"
        value="999"
        onValueChange={() => {}}
        error="Ошибка"
        className="consumer"
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'my-order');
    expect(input).toHaveAttribute('name', 'order');
    expect(input).toHaveAccessibleDescription('Ошибка');
    expect(input.parentElement!.parentElement).toHaveClass('consumer');
  });
});
describe('warning state (679:24334)', () => {
  it('shows the warning as the hint without marking the field invalid', () => {
    render(
      <Input
        value="112"
        onValueChange={() => {}}
        warning="Заказ № 112 уже добавлен"
      />,
    );
    const field = screen.getByLabelText('Номер заказа', { exact: true });
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).toHaveAccessibleDescription('Заказ № 112 уже добавлен');
    expect(field.closest('[data-state]')).toHaveAttribute(
      'data-state',
      'warning',
    );
  });
  it('lets an error take precedence over a warning', () => {
    render(<Input value="1" onValueChange={() => {}} warning="w" error="e" />);
    expect(
      screen.getByLabelText('Номер заказа', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
  });
});
