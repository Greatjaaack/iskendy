import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement matchMedia. Browser tests verify the real breakpoint.
if (typeof window !== 'undefined')
  window.matchMedia = (query: string) => ({
    matches: window.innerWidth >= 768,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
afterEach(cleanup);

// Layout scrolling is a browser capability; jsdom does not implement it.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo)
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    if (typeof options === 'number') {
      this.scrollLeft = options;
      this.scrollTop = y ?? 0;
    } else {
      if (options?.left !== undefined) this.scrollLeft = options.left;
      if (options?.top !== undefined) this.scrollTop = options.top;
    }
  };
