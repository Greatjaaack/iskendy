type AudioFactory = () => AudioContext | undefined;
function browserAudio(): AudioContext | undefined {
  const Audio =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Audio ? new Audio() : undefined;
}
export function createSound(factory: AudioFactory = browserAudio) {
  let context: AudioContext | undefined;
  async function unlockFromGesture(): Promise<void> {
    try {
      context ??= factory();
      if (context?.state === 'suspended') await context.resume();
    } catch {
      /* Autoplay may remain blocked. */
    }
  }
  return {
    unlockFromGesture,
    installGestureUnlock(
      target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
    ): () => void {
      const unlock = () => {
        void unlockFromGesture();
      };
      const events = ['pointerdown', 'keydown', 'touchstart'];
      for (const name of events)
        target.addEventListener(name, unlock, { once: true, passive: true });
      return () => {
        for (const name of events) target.removeEventListener(name, unlock);
      };
    },
    async chime(): Promise<void> {
      await unlockFromGesture();
      if (!context) return;
      try {
        const now = context.currentTime;
        for (const [index, frequency] of [880, 1174.7].entries()) {
          const oscillator = context.createOscillator(),
            gain = context.createGain(),
            start = now + index * 0.14;
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.28, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(start);
          oscillator.stop(start + 0.55);
        }
      } catch {
        /* Status and notification remain available. */
      }
    },
  };
}
