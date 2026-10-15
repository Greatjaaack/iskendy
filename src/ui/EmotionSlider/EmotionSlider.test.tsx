import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emotionNames, emotions, type Emotion } from '../../content/emotion';
import { EmotionSlider } from './EmotionSlider';
describe('five-stop emotion slider', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  for (const value of emotions)
    it(`exposes exact name and range at ${value}`, () => {
      render(
        <EmotionSlider value={value} onValueChange={vi.fn()} label="test" />,
      );
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAccessibleName('test');
      expect(slider).toHaveAttribute('aria-valuemin', '1');
      expect(slider).toHaveAttribute('aria-valuemax', '5');
      expect(slider).toHaveAttribute('aria-valuenow', String(value));
      expect(slider).toHaveAttribute('aria-valuetext', emotionNames[value - 1]);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  it('moves by one stop, respects endpoints, and vibrates once per actual change', () => {
    const vibration = vi.fn();
    vi.stubGlobal('navigator', { vibrate: vibration });
    function Controlled() {
      const [value, setValue] = useState<Emotion>(3);
      return (
        <EmotionSlider value={value} onValueChange={setValue} label="test" />
      );
    }
    render(<Controlled />);
    const slider = screen.getByRole('slider');
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight'])
      fireEvent.keyDown(slider, { key });
    expect(slider).toHaveAttribute('aria-valuenow', '5');
    expect(vibration).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '1');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(vibration).toHaveBeenCalledTimes(3);
    expect(vibration).toHaveBeenLastCalledWith(8);
    vi.unstubAllGlobals();
  });
  it('keeps keyboard interaction working when vibration is blocked', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw Error('blocked');
      },
    });
    const change = vi.fn();
    render(<EmotionSlider value={3} onValueChange={change} label="test" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(change).toHaveBeenCalledWith(2);
    vi.unstubAllGlobals();
  });
  it('does not accept keyboard changes when disabled', () => {
    const change = vi.fn();
    render(
      <EmotionSlider value={3} onValueChange={change} label="test" disabled />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('data-disabled');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(change).not.toHaveBeenCalled();
  });
});
