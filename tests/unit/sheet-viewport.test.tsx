import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Sheet } from '../../src/ui/Sheet/Sheet';

afterEach(() => vi.unstubAllGlobals());
it('measures a newly mounted portal and follows the usable viewport above the keyboard', async () => {
  vi.stubGlobal('innerWidth', 390);
  const viewport = Object.assign(new EventTarget(), {
    height: 400,
    offsetTop: 20,
  });
  vi.stubGlobal('visualViewport', viewport);
  const content = (open: boolean) => (
    <Sheet open={open} onOpenChange={vi.fn()} title="Добавить заказ" focusField>
      <label>
        Номер заказа
        <input />
      </label>
    </Sheet>
  );
  const { rerender } = render(content(false));
  expect(screen.queryByRole('dialog')).toBeNull();
  rerender(content(true));
  const sheet = await screen.findByRole('dialog');
  await waitFor(() => expect(sheet.style.maxHeight).toBe('368px'));
  expect(sheet.style.bottom).toBe(Math.max(0, window.innerHeight - 420) + 'px');
  expect(screen.getByLabelText('Номер заказа')).toHaveFocus();
  viewport.height = 500;
  viewport.offsetTop = 0;
  viewport.dispatchEvent(new Event('resize'));
  expect(sheet.style.maxHeight).toBe('468px');
  expect(sheet.style.bottom).toBe(Math.max(0, window.innerHeight - 500) + 'px');
});
