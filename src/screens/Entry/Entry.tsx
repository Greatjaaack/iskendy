import { useEffect } from 'react';
import { useNavigate } from '../../app/router';
import { entryContent as text } from '../../content/entry';
import { Button } from '../../ui/Button/Button';
import { Input } from '../../ui/Input/Input';
import { useOrderClaim } from './useOrderClaim';
import styles from './Entry.module.css';
/** S0 664:23501: no orders yet — only the number field (Q-14: no queue before a claim). */
export function Entry({
  onTyping,
  embedded = false,
}: {
  /** Another tab may add an order meanwhile; the field stays while the guest types. */
  onTyping?: (typing: boolean) => void;
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  // SEC-02: the address never carries the order number or date.
  const claim = useOrderClaim({
    onSuccess: () => {
      onTyping?.(false);
      navigate('/board?my=1');
    },
  });
  useEffect(() => () => onTyping?.(false), [onTyping]);
  const Container = embedded ? 'section' : 'main';
  return (
    <Container className={styles.main}>
      <form
        className={styles.hero}
        onSubmit={(event) => void claim.submit(event)}
        noValidate
      >
        {!embedded && <h1 tabIndex={-1}>{text.title}</h1>}
        <p className={styles.description}>{text.description}</p>
        <Input
          value={claim.number}
          onValueChange={(value) => {
            claim.change(value);
            onTyping?.(value !== '');
          }}
          maxLength={6}
          error={claim.error || undefined}
          disabled={claim.busy}
          className={styles.input}
        />
        {claim.error && (
          <span role="alert" className={styles.error}>
            {claim.error}
          </span>
        )}
        <Button
          type="submit"
          label={text.submit}
          state={claim.busy ? 'loading' : 'default'}
          className={styles.submit}
        />
        <p role="status" className={styles.notice}>
          {claim.notice}
        </p>
      </form>
    </Container>
  );
}
