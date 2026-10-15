import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNavigationVisibility } from '../../src/app/navigation-visibility';
beforeEach(() => {
  vi.stubGlobal('scrollY', 0);
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
function harness() {
  const owner = createNavigationVisibility(),
    changed = vi.fn(),
    stop = owner.subscribe(changed);
  const scroll = (y: number) => {
    vi.stubGlobal('scrollY', y);
    window.dispatchEvent(new Event('scroll'));
  };
  return { owner, changed, stop, scroll };
}
it('hides down, appears up, and stays visible near the beginning', () => {
  const h = harness();
  h.scroll(100);
  expect(h.owner.getSnapshot()).toBe('hidden');
  h.scroll(60);
  expect(h.owner.getSnapshot()).toBe('visible');
  h.scroll(80);
  h.scroll(4);
  expect(h.owner.getSnapshot()).toBe('visible');
  h.stop();
});
it('accumulates small scroll movements without unstable changes', () => {
  const h = harness();
  h.scroll(2);
  h.scroll(19);
  expect(h.owner.getSnapshot()).toBe('hidden');
  h.changed.mockClear();
  h.scroll(20);
  h.scroll(21);
  expect(h.changed).not.toHaveBeenCalled();
  h.stop();
});
it('reveals a hidden menu on keyboard focus and keeps focused actions available', () => {
  document.body.innerHTML =
    '<nav data-guest-navigation><button>Action</button></nav>';
  const h = harness();
  h.scroll(200);
  document.querySelector('button')!.focus();
  expect(h.owner.getSnapshot()).toBe('visible');
  h.scroll(300);
  expect(h.owner.getSnapshot()).toBe('visible');
  h.stop();
});
it('screen keyboard cannot cover an editable field with the floating menu', () => {
  const viewport = Object.assign(new EventTarget(), { height: 400 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 844);
  document.body.innerHTML =
    '<input><nav data-guest-navigation><button>Action</button></nav>';
  const h = harness();
  document.querySelector('input')!.focus();
  expect(h.owner.getSnapshot()).toBe('keyboard');
  h.scroll(200);
  expect(h.owner.getSnapshot()).toBe('keyboard');
  viewport.height = 800;
  viewport.dispatchEvent(new Event('resize'));
  expect(h.owner.getSnapshot()).toBe('visible');
  document.querySelector('button')!.focus();
  viewport.height = 400;
  viewport.dispatchEvent(new Event('resize'));
  expect(h.owner.getSnapshot()).toBe('visible');
  h.stop();
});
it('does not hide for normal browser panels and removes all handlers when unused', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 800 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 844);
  document.body.innerHTML = '<textarea></textarea>';
  const h = harness(),
    stopSecond = h.owner.subscribe(() => {});
  document.querySelector('textarea')!.focus();
  expect(h.owner.getSnapshot()).toBe('visible');
  document.querySelector('textarea')!.blur();
  await Promise.resolve();
  h.stop();
  h.scroll(100);
  expect(h.owner.getSnapshot()).toBe('hidden');
  stopSecond();
  h.scroll(200);
  expect(h.owner.getSnapshot()).toBe('visible');
});
it('hides the floating menu while a focused field lies under it without a screen keyboard (UX-13)', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 390 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 390);
  document.body.innerHTML =
    '<input id="under"><input id="above"><nav data-guest-navigation><button>Action</button></nav>';
  const rect = (top: number, height: number) =>
    ({
      top,
      bottom: top + height,
      left: 100,
      right: 700,
      width: 600,
      height,
    }) as DOMRect;
  document.querySelector('nav')!.getBoundingClientRect = () => rect(322, 56);
  document.querySelector('#under')!.getBoundingClientRect = () => rect(300, 48);
  document.querySelector('#above')!.getBoundingClientRect = () => rect(100, 48);
  // The hidden menu moves away: staying hidden must not depend on its new place.
  const h = harness();
  document.querySelector<HTMLInputElement>('#under')!.focus();
  expect(h.owner.getSnapshot()).toBe('keyboard');
  document.querySelector('nav')!.getBoundingClientRect = () => rect(500, 56);
  viewport.dispatchEvent(new Event('resize'));
  expect(h.owner.getSnapshot()).toBe('keyboard');
  document.querySelector<HTMLInputElement>('#above')!.focus();
  expect(h.owner.getSnapshot()).toBe('visible');
  document.querySelector<HTMLInputElement>('#above')!.blur();
  await Promise.resolve();
  expect(h.owner.getSnapshot()).toBe('visible');
  h.stop();
});
