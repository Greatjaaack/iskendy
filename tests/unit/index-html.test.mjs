import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// The static shell is what search results, link previews and the tab show before JS runs.
const html = readFileSync('index.html', 'utf8');
describe('static guest shell', () => {
  it('ships the search title agreed for the main page (Q-03)', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
    expect(title).toBe(
      'Искенди — где мой заказ · дюрюмная на Новослободской, 19',
    );
    expect(title).not.toMatch(/разработк/i);
  });
  it('leaves indexing to the backend, which only allows iskendy.ru/ (API-01)', () => {
    // backend main._indexable sends X-Robots-Tag noindex for every other path.
    expect(html).not.toMatch(/name="robots"/);
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{40,}"/);
  });
  it('gives crawlers without JavaScript the address and hours', () => {
    const fallback = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
    expect(fallback).toContain('Новослободская ул., 19, стр. 1');
    expect(fallback).toContain('11:30–22:00');
  });
  it('keeps the legacy icon links, served from the copied legacy assets', () => {
    for (const rel of ['icon', 'apple-touch-icon']) {
      const link = html.match(new RegExp(`<link[^>]*rel="${rel}"[^>]*>`))?.[0];
      expect(link).toContain('href="/assets/favicon.png"');
    }
    expect(existsSync('legacy/assets/favicon.png')).toBe(true);
  });
  it('lets iOS report safe-area insets (UX-01, as legacy does)', () => {
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
    expect(viewport?.[1].split(/,\s*/)).toEqual([
      'width=device-width',
      'initial-scale=1.0',
      'viewport-fit=cover',
    ]);
  });
});
