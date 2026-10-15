import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import { Loader } from '../src/ui/Loader/Loader';
import { Button } from '../src/ui/Button/Button';
import { Ticker } from '../src/ui/Ticker/Ticker';
import { EmotionSlider } from '../src/ui/EmotionSlider/EmotionSlider';
import { Dock } from '../src/ui/Dock/Dock';
import type { Emotion } from '../src/content/emotion';
import '../src/styles/global.css';
if (!import.meta.env.DEV && import.meta.env.MODE !== 'mock')
  throw new Error('Motion fixture is development only.');
declare global {
  interface Window {
    __ISKENDY_MOTION_TEST__?: {
      count: () => number;
      tweens: () => {
        duration: number;
        repeat: number;
        paused: boolean;
        kind: string;
      }[];
    };
  }
}
window.__ISKENDY_MOTION_TEST__ = {
  count: () => gsap.globalTimeline.getChildren(true, true, false).length,
  tweens: () =>
    gsap.globalTimeline.getChildren(true, true, false).map((t) => ({
      duration: t.duration(),
      repeat: t.repeat(),
      paused: t.paused(),
      kind: String(
        'rotation' in t.vars ? 'loader' : 'x' in t.vars ? 'ticker' : 'other',
      ),
    })),
};
function Fixture() {
  const [mounted, setMounted] = useState(true),
    [emotion, setEmotion] = useState<Emotion>(1),
    [loading, setLoading] = useState(false);
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: 'auto' }}>
      <button data-action="mount" onClick={() => setMounted(true)}>
        Mount
      </button>
      <button data-action="unmount" onClick={() => setMounted(false)}>
        Unmount
      </button>
      <button data-action="loading" onClick={() => setLoading(!loading)}>
        Loading
      </button>
      {mounted && (
        <div data-motion-fixture>
          <Loader label="Проверяем…" />
          <Button label="Отслеживать" state={loading ? 'loading' : 'default'} />
          <Button label="Проверяем…" variant="secondary" state="loading" />
          <Ticker />
          <EmotionSlider
            value={emotion}
            onValueChange={setEmotion}
            label="Эмоция"
          />
          <Dock active="order" collection />
          <input aria-label="Тестовое поле" />
          <div style={{ height: 2400 }} />
        </div>
      )}
    </main>
  );
}
const root = document.getElementById('motion');
if (!root) throw new Error('Missing motion root');
createRoot(root).render(<Fixture />);
