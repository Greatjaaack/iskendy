import { useLayoutEffect, useRef, useState } from 'react';
import { tvContent as copy } from '../../content/tv';
import { Logo } from '../Brand/Logo';
import { Rosette } from '../Brand/Rosette';
import styles from './TvBoard.module.css';
export type TvState = 'populated' | 'empty' | 'no-connection' | 'overflow';
export type TvBoardProps = {
  state: TvState;
  preparing?: readonly number[];
  ready?: readonly number[];
};
/** Visual-only board: no network, timers, storage or production routing. */
export function TvBoard({ state, preparing = [], ready = [] }: TvBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const measure = () =>
      setScale(Math.min(host.clientWidth / 1920, host.clientHeight / 1080));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const connected = state === 'populated' || state === 'overflow';
  const capacity = state === 'overflow' ? 12 : 6;
  if (connected && (preparing.length > capacity || ready.length > capacity))
    throw new RangeError(
      'TV author capacity exceeded; display policy is not defined.',
    );
  return (
    <div ref={ref} className={styles.viewport} data-testid="tv-preview">
      <main
        className={styles.scene}
        data-state={state}
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <header className={styles.header}>
          <Logo className={styles.logo} />
          <p>{copy.prompt}</p>
        </header>
        <div className={styles.columns}>
          {(['preparing', 'ready'] as const).map((tone) => (
            <section
              key={tone}
              className={styles.column}
              data-tone={tone}
              aria-labelledby={`tv-${tone}`}
            >
              <div className={styles.title}>
                <h1 id={`tv-${tone}`}>{copy[tone]}</h1>
                {tone === 'ready' && <em>{copy.readyAccent}</em>}
              </div>
              <div className={styles.divider} />
              {connected ? (
                <ol className={styles.numbers}>
                  {(tone === 'preparing' ? preparing : ready).map((number) => (
                    <li key={number}>{number}</li>
                  ))}
                </ol>
              ) : (
                <div className={styles.empty}>
                  <Rosette className={styles.rosette} />
                  <h2>{copy[state][tone === 'preparing' ? 0 : 1][0]}</h2>
                  <p>{copy[state][tone === 'preparing' ? 0 : 1][1]}</p>
                </div>
              )}
            </section>
          ))}
        </div>
        <footer className={styles.footer}>
          <p>{copy.footer}</p>
          <p>{copy.address}</p>
        </footer>
      </main>
    </div>
  );
}
