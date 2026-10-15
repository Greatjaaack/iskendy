import { gsap } from 'gsap';
import { act } from 'react';
import { useRef } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Runtime from '../../src/motion/runtime';
import { CursorFollower } from '../../src/motion/CursorFollower';
function pointer(
  node: Element,
  type: string,
  pointerType = 'mouse',
  relatedTarget: EventTarget | null = null,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: 200,
    clientY: 180,
    relatedTarget,
  });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(node, event);
  act(() => {
    gsap.globalTimeline.time(gsap.globalTimeline.time() + 1);
  });
}
function Fixture({ ready = false }: { ready?: boolean }) {
  const root = useRef<HTMLDivElement>(null),
    control = useRef<HTMLButtonElement>(null);
  return (
    <div ref={root}>
      <button ref={control}>Next</button>
      <button data-hover-card data-cursor-label="Открыть">
        Order
      </button>
      <a href="#help" data-faq>
        <span data-faq-front>Help</span>
        <span data-faq-back aria-hidden="true">
          Help
        </span>
      </a>
      <input aria-label="Number" />
      {ready && <Runtime kind="card" target={root} />}
      {ready && <Runtime kind="control" target={control} />}
      <CursorFollower />
    </div>
  );
}
describe('review pointer feedback', () => {
  it('retargets card and control hover, press and release without affecting touch', async () => {
    const { unmount, rerender } = render(<Fixture />);
    rerender(<Fixture ready />);
    const card = screen.getByRole('button', { name: 'Order' }),
      control = screen.getByRole('button', { name: 'Next' });
    pointer(card, 'pointerover', 'touch');
    expect(card.style.transform).toBe('');
    pointer(card, 'pointerover');
    await waitFor(() => expect(card.style.transform).toContain('1.02'));
    pointer(card, 'pointerout');
    await waitFor(() => expect(card.style.transform).not.toContain('1.02'));
    pointer(control, 'pointerenter');
    await waitFor(() => expect(control.style.transform).toContain('1.04'));
    pointer(control, 'pointerdown');
    await waitFor(() => expect(control.style.transform).toContain('0.98'));
    pointer(control, 'pointerup');
    await waitFor(() => expect(control.style.transform).toContain('1.04'));
    pointer(control, 'pointerleave');
    fireEvent.keyDown(control, { key: 'Enter' });
    await waitFor(() => expect(control.style.transform).toContain('0.98'));
    fireEvent.keyUp(control, { key: 'Enter' });
    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-guest-cursor');
  });
  it('rolls FAQ labels, switches contextual cursor, and restores native input cursor', async () => {
    const { unmount, rerender } = render(<Fixture />);
    rerender(<Fixture ready />);
    const card = screen.getByRole('button', { name: 'Order' }),
      faq = screen.getByRole('link', { name: 'Help' });
    pointer(card, 'pointermove');
    await waitFor(() =>
      expect(
        document.querySelector('[data-cursor-follower]'),
      ).toBeInTheDocument(),
    );
    expect(document.documentElement).toHaveAttribute(
      'data-guest-cursor',
      'true',
    );
    pointer(faq, 'pointerover');
    await waitFor(() =>
      expect(faq.querySelector('[data-faq-back]')).toHaveStyle({
        opacity: '1',
      }),
    );
    pointer(faq, 'pointermove');
    expect(
      document.querySelector('[data-cursor-follower]'),
    ).toBeInTheDocument();
    pointer(faq, 'pointerout');
    await waitFor(() =>
      expect(faq.querySelector('[data-faq-front]')).toHaveStyle({
        opacity: '1',
      }),
    );
    fireEvent.focusIn(faq);
    fireEvent.focusOut(faq);
    pointer(screen.getByRole('textbox'), 'pointermove');
    expect(document.documentElement).not.toHaveAttribute('data-guest-cursor');
    pointer(card, 'pointermove');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.documentElement).not.toHaveAttribute('data-guest-cursor');
    fireEvent.scroll(document);
    fireEvent.blur(window);
    fireEvent(document, new Event('visibilitychange'));
    unmount();
  });
});
