import { describe, expect, it, vi } from 'vitest';
import { createGuestSignals } from '../../src/platform/guest-signals';

describe('independent ready channels', () => {
  function adapters() {
    return {
      sound: {
        chime: vi.fn(async () => {}),
        unlockFromGesture: vi.fn(async () => {}),
        installGestureUnlock: vi.fn(() => vi.fn()),
      },
      notifications: {
        state: vi.fn(() => 'granted' as const),
        initialize: vi.fn(async () => {}),
        requestFromSubscribeGesture: vi.fn(async () => 'granted' as const),
        showReady: vi
          .fn<(number: number) => Promise<void>>()
          .mockResolvedValue(undefined),
        showRatingPrompt: vi
          .fn<(number: number) => Promise<void>>()
          .mockResolvedValue(undefined),
      },
      vibration: vi.fn(),
    };
  }
  it('fans out once using the legacy pattern and forwards gesture/init methods', async () => {
    const a = adapters(),
      signals = createGuestSignals(a);
    signals.ready(112);
    signals.subscribed();
    await signals.initialize();
    await signals.unlockFromGesture();
    signals.installGestureUnlock();
    expect(await signals.requestPermissionFromGesture()).toBe('granted');
    expect(a.vibration).toHaveBeenCalledWith([90, 70, 90, 70, 160]);
    expect(a.vibration).toHaveBeenCalledWith(30);
    expect(a.sound.chime).toHaveBeenCalledOnce();
    expect(a.notifications.showReady).toHaveBeenCalledExactlyOnceWith(112);
  });
  it('uses the existing rating pattern and keeps notification independent of failed sound/vibration', async () => {
    const a = adapters();
    a.vibration.mockImplementation(() => {
      throw new Error('unsupported');
    });
    a.sound.chime.mockRejectedValue(new Error('blocked'));
    createGuestSignals(a).rating(997);
    await Promise.resolve();
    expect(a.vibration).toHaveBeenCalledWith([60, 60, 60]);
    expect(a.notifications.showRatingPrompt).toHaveBeenCalledExactlyOnceWith(
      997,
    );
    expect(a.notifications.showReady).not.toHaveBeenCalled();
  });
  it('tolerates synchronous and async channel failures independently', async () => {
    const a = adapters();
    a.vibration.mockImplementation(() => {
      throw new Error('unsupported');
    });
    a.sound.chime.mockRejectedValue(new Error('blocked'));
    createGuestSignals(a).ready(112);
    await Promise.resolve();
    expect(a.notifications.showReady).toHaveBeenCalledOnce();
  });
});
