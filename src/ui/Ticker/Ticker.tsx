/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Native overflow region needs keyboard focus for scrolling (WCAG 2.1.1). */
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';
import { tickerContent as copy } from '../../content/ticker';
import pink from '../../assets/ticker/star-pink.svg?no-inline';
import yellow from '../../assets/ticker/star-yellow.svg?no-inline';
import olive from '../../assets/ticker/star-olive.svg?no-inline';
import blue from '../../assets/ticker/star-blue.svg?no-inline';
import heart from '../../assets/ticker/heart.svg?no-inline';
import styles from './Ticker.module.css';
/** Author cycle at 60px/s; static while focused or in reduced motion. Native horizontal scrolling keeps every message accessible. */
export function Ticker() {
  const track = useRef<HTMLDivElement>(null);
  const cycle = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const enabled = useMotionEnabled(!focused);
  const scrollByKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const host = event.currentTarget;
    const maximum = host.scrollWidth - host.clientWidth;
    const positions: Record<string, number> = {
      Home: 0,
      End: maximum,
      ArrowLeft: host.scrollLeft - host.clientWidth / 10,
      ArrowRight: host.scrollLeft + host.clientWidth / 10,
    };
    const position = positions[event.key];
    if (position === undefined) return;
    event.preventDefault();
    host.scrollLeft = Math.max(0, Math.min(maximum, position));
  };
  const star = (src: string) => (
    <img
      className={styles.star}
      src={src}
      width="18.6667"
      height="18.6667"
      alt=""
    />
  );
  const messages = (
    <>
      {star(pink)}
      <span className={styles.message}>
        {copy.love}
        <img
          className={styles.heart}
          src={heart}
          width="20"
          height="20"
          alt=""
        />
      </span>
      {star(yellow)}
      <span>{copy.appetite}</span>
      {star(olive)}
      <span className={styles.message}>
        <em className={styles.accent}>{copy.wisdom}</em>
        {copy.saying}
      </span>
      {star(blue)}
      <span>{copy.thanks}</span>
      {star(pink)}
      <span>{copy.choice}</span>
    </>
  );
  return (
    <div
      className={styles.ticker}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        event.currentTarget.scrollLeft = 0;
        setFocused(false);
      }}
      onKeyDown={scrollByKey}
      role="region"
      aria-label="Ticker"
      data-testid="ticker"
    >
      <div ref={track} className={styles.track}>
        <div ref={cycle} className={styles.cycle} data-ticker-cycle="original">
          {messages}
        </div>
        {enabled && (
          <div className={styles.cycle} aria-hidden="true">
            {messages}
          </div>
        )}
      </div>
      {enabled && (
        <MotionEnhancement kind="ticker" target={track} cycle={cycle} />
      )}
    </div>
  );
}
