import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emotionNames, emotions } from '../../content/emotion';
import { EmotionCharacter } from './EmotionCharacter';
describe('static original emotion characters', () => {
  for (const emotion of emotions)
    for (const size of ['lg', 'sm'] as const) {
      it(`${emotion} ${size} retains original slot geometry and accessible name`, () => {
        render(
          <EmotionCharacter
            emotion={emotion}
            size={size}
            alt={emotionNames[emotion - 1]}
          />,
        );
        const image = screen.getByRole('img');
        expect(image).toHaveAccessibleName(emotionNames[emotion - 1]);
        expect(image).toHaveAttribute('width', size === 'lg' ? '240' : '72');
        expect(image).toHaveAttribute('height', size === 'lg' ? '240' : '72');
        expect(image.getAttribute('src')).toBeTruthy();
        expect(document.querySelector('video, canvas')).toBeNull();
      });
    }
  it('is decorative when its consumer already supplies the emotion label', () => {
    const { container } = render(<EmotionCharacter emotion={3} />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
