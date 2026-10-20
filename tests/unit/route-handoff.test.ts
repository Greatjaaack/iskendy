import { describe, expect, it, vi } from 'vitest';
import { bindRouteHandoff } from '../../src/boot/route-handoff';

function browserStub() {
  const listeners = new Set<() => void>();
  const location = { pathname: '/staff', reload: vi.fn() };
  const change = vi.fn<History['pushState']>((_data, _unused, url) => {
    if (url != null)
      location.pathname = new URL(String(url), 'https://local.test').pathname;
  });
  const browser = {
    history: { pushState: change, replaceState: change },
    location,
    addEventListener: (_type: 'popstate', listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: 'popstate', listener: () => void) =>
      listeners.delete(listener),
  };
  return {
    browser,
    change,
    pop: () => listeners.forEach((listener) => listener()),
  };
}

describe('legacy guest route handoff', () => {
  it.each(['pushState', 'replaceState'] as const)(
    'preserves %s data/query and reloads only guest routes',
    (method) => {
      const { browser, change } = browserStub();
      bindRouteHandoff('legacy', browser);
      const state = { s: 'my' };
      browser.history[method](state, '', '/board?my=1');
      expect(change).toHaveBeenCalledWith(state, '', '/board?my=1');
      expect(browser.location.reload).toHaveBeenCalledOnce();
    },
  );
  it.each(['/board', '/board?', 'https://local.test/board#top'])(
    'sends the staff «Гостевое табло» push of %s to the queue, not the receipt entry',
    (url) => {
      const { browser, change } = browserStub();
      bindRouteHandoff('legacy', browser);
      const state = { s: 'board' };
      browser.history.pushState(state, '', url);
      expect(change).toHaveBeenLastCalledWith(state, '', '/board?view=queue');
      expect(browser.location.reload).toHaveBeenCalledOnce();
    },
  );
  it('leaves other legacy pushes to /board with a query untouched', () => {
    const { browser, change } = browserStub();
    bindRouteHandoff('legacy', browser);
    browser.history.pushState({}, '', '/board?my=1');
    expect(change).toHaveBeenLastCalledWith({}, '', '/board?my=1');
  });
  it.each(['/staff', '/stats', '/unknown'])(
    'keeps %s navigation within legacy',
    (path) => {
      const { browser } = browserStub();
      bindRouteHandoff('legacy', browser);
      browser.history.pushState({}, '', path);
      expect(browser.location.reload).not.toHaveBeenCalled();
    },
  );
  it('hands the landing route back to the new bootstrap', () => {
    const { browser } = browserStub();
    bindRouteHandoff('legacy', browser);
    browser.history.pushState({}, '', '/');
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });
  it('hands back guest routes reached by browser history', () => {
    const { browser, pop } = browserStub();
    bindRouteHandoff('legacy', browser);
    browser.location.pathname = '/board';
    pop();
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });
  it('does not reload if native history rejects a navigation', () => {
    const { browser } = browserStub();
    browser.history.pushState = vi.fn(() => {
      throw new DOMException('cross-origin', 'SecurityError');
    });
    bindRouteHandoff('legacy', browser);
    expect(() =>
      browser.history.pushState({}, '', 'https://external.test'),
    ).toThrow('cross-origin');
    expect(browser.location.reload).not.toHaveBeenCalled();
  });
  it('cleanup restores history methods and removes the handoff', () => {
    const { browser, change, pop } = browserStub();
    const dispose = bindRouteHandoff('legacy', browser);
    dispose();
    expect(browser.history.pushState).toBe(change);
    expect(browser.history.replaceState).toBe(change);
    browser.location.pathname = '/board';
    pop();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });
});

describe('new app route handoff', () => {
  it.each(['/staff', '/stats'])(
    'boots legacy when history returns to %s',
    (path) => {
      const { browser, pop } = browserStub();
      bindRouteHandoff('app', browser);
      browser.location.pathname = path;
      pop();
      expect(browser.location.reload).toHaveBeenCalledOnce();
    },
  );
  it.each(['/', '/board?my=1', '/board?view=queue'])(
    'keeps guest navigation %s within the app',
    (path) => {
      const { browser } = browserStub();
      bindRouteHandoff('app', browser);
      browser.history.pushState({}, '', path);
      expect(browser.location.reload).not.toHaveBeenCalled();
    },
  );
});
