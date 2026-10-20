import { useLayoutEffect, useRef, useState } from 'react';
import { tvContent as copy } from '../../content/tv';
import {
  TV_OVERFLOW_CAPACITY,
  TV_POPULATED_CAPACITY,
  type TvState,
} from '../../domain/tv/view';
import { Logo } from '../Brand/Logo';
import { Rosette } from '../Brand/Rosette';
import styles from './TvBoard.module.css';
export type { TvState } from '../../domain/tv/view';
export type TvBoardProps = {
  state: TvState;
  preparing?: readonly number[];
  ready?: readonly number[];
  /** Folded tail of a column beyond the overflow grid, shown as «+N». */
  preparingMore?: number;
  readyMore?: number;
  /** Owner decision 20.10.2026: the hall TV keeps the legacy QR to /board. */
  qrSrc?: string;
};
/** Presentational board: data, timers and routing live in src/app/TvApp. */
export function TvBoard({
  state,
  preparing = [],
  ready = [],
  preparingMore = 0,
  readyMore = 0,
  qrSrc,
}: TvBoardProps) {
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
  const capacity =
    state === 'overflow' ? TV_OVERFLOW_CAPACITY : TV_POPULATED_CAPACITY;
  const columns = {
    preparing: { numbers: preparing, more: preparingMore },
    ready: { numbers: ready, more: readyMore },
  };
  if (
    connected &&
    Object.values(columns).some(
      ({ numbers, more }) => numbers.length + (more ? 1 : 0) > capacity,
    )
  )
    throw new RangeError('TV column capacity exceeded; fold the tail into +N.');
  return (
    <div ref={ref} className={styles.viewport} data-testid="tv-preview">
      <main
        className={styles.scene}
        data-state={state}
        data-qr={qrSrc ? '' : undefined}
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <header className={styles.header}>
          <Logo className={styles.logo} />
          {!qrSrc && <p>{copy.prompt}</p>}
          {qrSrc && (
            <figure className={styles.qr}>
              <figcaption>{copy.qr}</figcaption>
              <img src={qrSrc} alt={copy.qrAlt} />
            </figure>
          )}
        </header>
        <div className={styles.columns}>
          {(['preparing', 'ready'] as const).map((tone) => {
            const { numbers, more } = columns[tone];
            const message =
              copy[connected ? 'empty' : state][tone === 'preparing' ? 0 : 1];
            return (
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
                {connected && numbers.length > 0 ? (
                  <ol className={styles.numbers}>
                    {numbers.map((number) => (
                      <li key={number}>{number}</li>
                    ))}
                    {more > 0 && (
                      <li className={styles.more} aria-label={copy.more(more)}>
                        +{more}
                      </li>
                    )}
                  </ol>
                ) : (
                  <div className={styles.empty}>
                    <Rosette className={styles.rosette} />
                    <h2>{message[0]}</h2>
                    <p>{message[1]}</p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <footer className={styles.footer}>
          <p>{copy.footer}</p>
          <p>{copy.address}</p>
        </footer>
      </main>
    </div>
  );
}
