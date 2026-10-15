import { createRoot } from 'react-dom/client';
import { TvBoard, type TvState } from '../src/ui/TvBoard/TvBoard';
import '../src/styles/global.css';
if (!import.meta.env.DEV && import.meta.env.MODE !== 'mock')
  throw new Error('Synthetic TV preview requires mock mode.');
const states: TvState[] = ['populated', 'empty', 'no-connection', 'overflow'];
const requested = new URLSearchParams(location.search).get('state');
const state = states.find((value) => value === requested) ?? 'populated';
const root = document.getElementById('tv');
if (!root) throw new Error('Missing TV root.');
createRoot(root).render(
  <TvBoard
    state={state}
    preparing={
      state === 'overflow'
        ? Array.from({ length: 12 }, (_, i) => 201 + i)
        : [108, 110, 111, 112, 113, 114]
    }
    ready={
      state === 'overflow'
        ? Array.from({ length: 12 }, (_, i) => 213 + i)
        : [102, 104, 107, 109]
    }
  />,
);
