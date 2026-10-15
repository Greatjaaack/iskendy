import {
  MotionEnhancement,
  useMotionEnabled,
} from '../../motion/MotionEnhancement';
import thumbArt from '../../assets/emotion-slider/thumb.svg?no-inline';
import mark1 from '../../assets/emotion-slider/mark-1.svg?no-inline';
import mark2 from '../../assets/emotion-slider/mark-2.svg?no-inline';
import mark3 from '../../assets/emotion-slider/mark-3.svg?no-inline';
import mark4 from '../../assets/emotion-slider/mark-4.svg?no-inline';
import mark5 from '../../assets/emotion-slider/mark-5.svg?no-inline';
import * as Slider from '@radix-ui/react-slider';
import { useLayoutEffect, useRef, useState } from 'react';
import { emotionNames, type Emotion } from '../../content/emotion';
import { vibrate } from '../../platform/vibration';
import v1 from '../../assets/emotion-slider/value-1.svg';
import v2 from '../../assets/emotion-slider/value-2.svg';
import v3 from '../../assets/emotion-slider/value-3.svg';
import v4 from '../../assets/emotion-slider/value-4.svg';
import v5 from '../../assets/emotion-slider/value-5.svg';
import styles from './EmotionSlider.module.css';

const marks = [mark1, mark2, mark3, mark4, mark5];
const visuals = [v1, v2, v3, v4, v5];
const frameWidth = 342,
  frameHeight = 56,
  halfTarget = 28;
/** Original SVG states, overlaid by Radix. Resize only scales the original visual;
 * the interactive thumb remains 56 px and follows the exact stop centres. */
export function EmotionSlider({
  value,
  onValueChange,
  label,
  valueText,
  disabled = false,
}: {
  /** null: value=none (680:24349) — track and stops only, no thumb (UX-16). */
  value: Emotion | null;
  onValueChange: (value: Emotion) => void;
  label: string;
  valueText?: string;
  disabled?: boolean;
}) {
  const indicator = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const enabled = useMotionEnabled();
  const position = ((value ?? 3) - 1) * 71.5;
  const [initialPosition] = useState(position);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(frameWidth);
  useLayoutEffect(() => {
    if (!frame.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(Math.min(frameWidth, next));
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const scale = width / frameWidth;
  const pick = (next: number | undefined, same = false) => {
    if (
      next &&
      Number.isInteger(next) &&
      next >= 1 &&
      next <= 5 &&
      (same || next !== value)
    ) {
      vibrate(8);
      onValueChange(next as Emotion);
    }
  };
  const inset = halfTarget * (1 - scale);
  return (
    <div ref={frame} className={styles.frame} data-value={value ?? 'none'}>
      <div
        className={styles.visual}
        aria-hidden="true"
        style={{
          transform: `scale(${scale})`,
          top: (frameHeight - frameHeight * scale) / 2,
        }}
      >
        {value === null ? (
          <div className={styles.layers}>
            <span className={styles.canvas} />
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className={styles.stop}
                style={{ left: 24 + index * 71.5 }}
              />
            ))}
          </div>
        ) : enabled ? (
          <div className={styles.layers}>
            <span className={styles.canvas} />
            <span
              ref={fill}
              data-slider-fill
              className={styles.fillBody}
              style={{ width: initialPosition + 56 }}
            />
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className={styles.stop}
                style={{ left: 24 + index * 71.5 }}
              />
            ))}
            <span
              ref={indicator}
              className={styles.indicator}
              style={{ transform: `translateX(${initialPosition}px)` }}
            >
              <img
                className={styles.thumbArt}
                src={thumbArt}
                width="72"
                height="72"
                alt=""
              />
              {marks.map((src, index) => (
                <img
                  key={src}
                  className={styles.mark}
                  src={src}
                  width="14"
                  height="14"
                  alt=""
                  data-slider-mark
                  data-active={index === value - 1}
                />
              ))}
            </span>
          </div>
        ) : (
          <>
            <img
              src={visuals[value - 1]}
              alt=""
              className={value === 1 ? styles.first : undefined}
            />
          </>
        )}
      </div>
      {enabled && value !== null && (
        <MotionEnhancement
          kind="slider"
          target={indicator}
          fill={fill}
          value={position}
        />
      )}
      <Slider.Root
        className={styles.slider}
        style={{ left: -inset, width: width + 2 * inset }}
        min={1}
        max={5}
        step={1}
        value={[value ?? 3]}
        disabled={disabled}
        onValueChange={(values) => pick(values[0])}
        // Without a value a tap on the middle stop changes nothing, so commit it.
        onValueCommit={(values) => value === null && pick(values[0], true)}
      >
        <Slider.Track className={styles.track} />
        <Slider.Thumb
          className={styles.thumb}
          aria-label={label}
          aria-valuetext={
            valueText ?? (value ? emotionNames[value - 1] : undefined)
          }
        />
      </Slider.Root>
    </div>
  );
}
