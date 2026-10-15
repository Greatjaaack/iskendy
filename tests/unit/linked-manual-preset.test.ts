import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { applyLinkedManualPreset } from '../../dev/manual-presets';
import { resetFixtures } from '../msw/handlers';
beforeEach(() => {
  vi.stubEnv('MODE', 'mock');
  localStorage.clear();
  sessionStorage.clear();
  resetFixtures();
});
afterEach(() => vi.unstubAllEnvs());
describe('explicit linked mock scenario', () => {
  it('seeds997 once and reload preserves confirmed feedback and unknown fields', () => {
    sessionStorage.setItem('iskendy_linked_manual_preset', 'positive');
    sessionStorage.setItem('iskendy_linked_manual_seed', '1');
    applyLinkedManualPreset();
    const record = JSON.parse(localStorage.getItem('iskendi_my_order')!);
    expect(record.n).toBe(997);
    expect(sessionStorage.getItem('iskendy_linked_manual_seed')).toBeNull();
    expect(sessionStorage.getItem('iskendy_manual_preset')).toBeNull();
    const saved = JSON.stringify({
      ...record,
      unknown: 'retain',
      fb: {
        id: 1,
        token: 'synthetic',
        rating: 5,
        branch: 'positive',
        detailSent: true,
      },
      done: true,
    });
    localStorage.setItem('iskendi_my_order', saved);
    localStorage.setItem('iskendy_orders_v1:confirmed', 'preserve');
    applyLinkedManualPreset();
    expect(localStorage.getItem('iskendi_my_order')).toBe(saved);
    expect(localStorage.getItem('iskendy_orders_v1:confirmed')).toBe(
      'preserve',
    );
  });
  it('keeps the existing manual collection mechanism without a linked scenario', () => {
    sessionStorage.setItem('iskendy_manual_preset', 'orders2');
    applyLinkedManualPreset();
    expect(
      Object.keys(localStorage).filter((k) =>
        k.startsWith('iskendy_orders_v1:'),
      ),
    ).toHaveLength(2);
  });
  it('does not accept an arbitrary linked scenario or reset existing data', () => {
    sessionStorage.setItem('iskendy_linked_manual_preset', '../unknown');
    localStorage.setItem('preserve', 'yes');
    applyLinkedManualPreset();
    expect(localStorage.getItem('preserve')).toBe('yes');
  });
  it('respects a later explicit choice in the existing manual harness', () => {
    sessionStorage.setItem('iskendy_linked_manual_preset', 'positive');
    sessionStorage.setItem('iskendy_manual_preset', 'orders2');
    applyLinkedManualPreset();
    expect(sessionStorage.getItem('iskendy_linked_manual_preset')).toBeNull();
    expect(
      Object.keys(localStorage).filter((k) =>
        k.startsWith('iskendy_orders_v1:'),
      ),
    ).toHaveLength(2);
  });
  it('does nothing outside explicit mock mode', () => {
    vi.stubEnv('MODE', 'production');
    sessionStorage.setItem('iskendy_linked_manual_preset', 'positive');
    sessionStorage.setItem('iskendy_linked_manual_seed', '1');
    localStorage.setItem('preserve', 'yes');
    applyLinkedManualPreset();
    expect(localStorage.getItem('iskendi_my_order')).toBeNull();
    expect(localStorage.getItem('preserve')).toBe('yes');
  });
});
