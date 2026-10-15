import { useId } from 'react';
import type { ChangeEvent } from 'react';
import { parseOrderNumber } from '../../domain/order/subscribe';
import { inputContent } from '../../content/input';
import styles from './Input.module.css';
export const inputStates = [
  'default',
  'hover',
  'focus',
  'filled',
  'error',
  'disabled',
] as const;
export type InputState = (typeof inputStates)[number];
type Props = {
  kind?: 'order-number' | 'comment';
  value: string;
  onValueChange: (value: string) => void;
  state?: InputState;
  error?: string;
  /** 679:24334: a valid number that needs attention (e.g. already added). */
  warning?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
  showHint?: boolean;
  className?: string;
  maxLength?: number;
};
export function Input({
  kind = 'order-number',
  value,
  onValueChange,
  state,
  error,
  warning,
  disabled = false,
  id,
  name,
  label,
  hint,
  placeholder,
  showHint = true,
  className,
  maxLength,
}: Props) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = controlId + '-hint';
  const comment = kind === 'comment';
  const limit = maxLength ?? (comment ? 1000 : 6); // API: 1..100000
  const validationError =
    !comment && value.trim() !== '' && parseOrderNumber(value) === null
      ? inputContent.invalidNumber
      : undefined;
  const fieldError = error ?? validationError;
  const currentState = disabled
    ? 'disabled'
    : fieldError
      ? 'error'
      : warning
        ? 'warning'
        : (state ?? (value ? 'filled' : 'default'));
  const invalid = currentState === 'error';
  const message = invalid
    ? (fieldError ??
      (comment ? inputContent.commentError : inputContent.orderError(value)))
    : (warning ??
      hint ??
      (comment ? inputContent.commentHint : inputContent.orderHint));
  const hasMessage = invalid || showHint;
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onValueChange(event.currentTarget.value);
  const controlProps = {
    id: controlId,
    name,
    value,
    onChange: change,
    disabled: currentState === 'disabled',
    'aria-invalid': invalid || undefined,
    'aria-describedby': hasMessage ? hintId : undefined,
  };
  return (
    <div
      data-state={currentState}
      data-kind={kind}
      className={[styles.wrapper, comment ? 'ym-hide-content' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <label htmlFor={controlId} className={styles.label}>
        {label ??
          (comment ? inputContent.commentLabel : inputContent.orderLabel)}
      </label>
      <div className={styles.field}>
        {comment ? (
          <textarea
            {...controlProps}
            maxLength={limit}
            className={[styles.control, styles.comment, 'ym-disable-keys'].join(
              ' ',
            )}
            placeholder={placeholder ?? inputContent.commentPlaceholder}
          />
        ) : (
          <>
            <input
              {...controlProps}
              className={styles.control}
              type="text"
              inputMode="numeric"
              pattern={`[0-9]{1,${limit}}`}
              maxLength={limit}
              autoComplete="off"
              placeholder={placeholder ?? inputContent.orderPlaceholder}
            />
            {currentState === 'filled' && (
              <span className={styles.ok} aria-hidden="true" />
            )}
          </>
        )}
      </div>
      {hasMessage && (
        <p id={hintId} className={styles.hint}>
          {message}
        </p>
      )}
    </div>
  );
}
