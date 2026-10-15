import { vi } from 'vitest';
import type { GuestSignals } from '../../../src/platform/guest-signals';
export function fakeSignals(): GuestSignals {
  return {
    permission: vi.fn(() => 'unsupported' as const),
    initialize: vi.fn(async () => {}),
    installGestureUnlock: vi.fn(() => vi.fn()),
    unlockFromGesture: vi.fn(async () => {}),
    requestPermissionFromGesture: vi.fn(async () => 'unsupported' as const),
    subscribed: vi.fn(),
    ready: vi.fn(),
    rating: vi.fn(),
  };
}
