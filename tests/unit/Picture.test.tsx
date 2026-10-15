import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Picture } from '../../src/ui/Picture/Picture';
import pixel from '../fixtures/pixel.png?w=1&format=webp;png&as=picture';

describe('static responsive image pipeline', () => {
  it('transforms a synthetic one-pixel fixture with the actual installed imagetools plugin', () => {
    expect(pixel.img.w).toBe(1);
    expect(pixel.img.h).toBe(1);
    expect(pixel.sources.webp).toBeTruthy();
    render(
      <Picture image={pixel} alt="Тестовый пиксель" sizes="100vw" priority />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('width', '1');
    expect(img).toHaveAttribute('height', '1');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('decoding', 'async');
  });
  it('defaults secondary images to lazy loading and maps JPEG MIME correctly', () => {
    const { container } = render(
      <Picture
        image={{
          img: { src: '/fixture.jpg', w: 100, h: 80 },
          sources: { jpg: '/fixture.jpg 100w' },
        }}
        alt="Тест"
        sizes="50vw"
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
    expect(screen.getByRole('img')).toHaveAttribute('fetchpriority', 'auto');
    expect(container.querySelector('source')).toHaveAttribute(
      'type',
      'image/jpeg',
    );
  });
});
