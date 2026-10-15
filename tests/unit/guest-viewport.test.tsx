import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useDesktopViewport } from '../../src/app/guest-viewport';
it('switches the issued layout on the actual media change and unsubscribes on unmount', () => {
  let matches = false;
  const listeners = new Set<() => void>();
  const media = {
    ...window.matchMedia('(min-width: 768px)'),
    get matches() {
      return matches;
    },
    addEventListener: (_: string, callback: () => void) =>
      listeners.add(callback),
    removeEventListener: (_: string, callback: () => void) =>
      listeners.delete(callback),
  } as unknown as MediaQueryList;
  const spy = vi.spyOn(window, 'matchMedia').mockReturnValue(media);
  try {
    const { result, unmount } = renderHook(useDesktopViewport);
    expect(result.current).toBe(false);
    expect(spy).toHaveBeenCalledWith('(min-width: 768px)');
    act(() => {
      matches = true;
      for (const callback of listeners) callback();
    });
    expect(result.current).toBe(true);
    act(() => {
      matches = false;
      for (const callback of listeners) callback();
    });
    expect(result.current).toBe(false);
    unmount();
    expect(listeners.size).toBe(0);
  } finally {
    spy.mockRestore();
  }
});
