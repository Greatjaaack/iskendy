import { useEffect, useRef, type RefObject } from 'react';
import { ordersContent } from '../../content/orders';
import { orderOverlaysContent as text } from '../../content/order-overlays';
import { entryContent } from '../../content/entry';
import { Button } from '../../ui/Button/Button';
import { Icon } from '../../ui/Icon/Icon';
import { Input } from '../../ui/Input/Input';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useOrderClaim } from '../Entry/useOrderClaim';
import type { OrderRecord } from '../../storage/schemas';
import type { NotificationState } from '../../platform/notifications';
import styles from './OrderOverlays.module.css';

/** Loaded on the first tap: «⋯» popover, confirmations and sheets stay out of the first screen. */
export function OrderMenu({
  anchor,
  showBoard,
  onClose,
  onBoard,
  onNotifications,
  onRemove,
}: {
  anchor: RefObject<HTMLElement | null>;
  showBoard: boolean;
  onClose: (restoreFocus: boolean) => void;
  onBoard: () => void;
  onNotifications: () => void;
  onRemove: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const items = () =>
      Array.from(
        menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ??
          [],
      );
    items()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(true);
      } else if (event.key === 'Tab') onClose(false);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        list[(index + step + list.length) % list.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        list[event.key === 'Home' ? 0 : list.length - 1]?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menu.current?.contains(target) || anchor.current?.contains(target))
        return;
      onClose(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [anchor, onClose]);
  return (
    <div
      ref={menu}
      role="menu"
      aria-label={ordersContent.menu}
      className={styles.menu}
    >
      {showBoard && (
        <button
          type="button"
          role="menuitem"
          className={styles.item}
          onClick={onBoard}
        >
          <Icon name="board" />
          {text.menuBoard}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={onNotifications}
      >
        <Icon name="bell" />
        {text.menuNotifications}
      </button>
      <span role="separator" className={styles.separator} />
      <button
        type="button"
        role="menuitem"
        className={[styles.item, styles.danger].join(' ')}
        onClick={onRemove}
      >
        <Icon name="minus-circle" />
        {text.menuRemove}
      </button>
    </div>
  );
}
type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};
/** S1b 669:23692 (phone) / 684:51957 (≥ 768): removal is local only (ADR-019). */
export function RemoveOrder({
  number,
  wide,
  onConfirm,
  ...sheet
}: SheetProps & { number: number; wide: boolean; onConfirm: () => void }) {
  return (
    <Sheet {...sheet} title={text.removeTitle(number)}>
      <p className={styles.body}>{text.removeBody(wide)}</p>
      <div className={styles.actions}>
        <Button label={text.removeConfirm} onClick={onConfirm} />
        <Dismiss
          label={text.removeCancel}
          onClick={() => sheet.onOpenChange(false)}
        />
      </div>
    </Sheet>
  );
}
function Dismiss({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button label={label} variant="secondary" onClick={onClick} />;
}
/** S3n 682:24531 / 687:58924: platform hint, nothing is toggled here. */
export function Notifications({
  permission,
  ...sheet
}: SheetProps & { permission: NotificationState }) {
  const body =
    permission === 'unsupported'
      ? text.notificationsBody.unsupported
      : permission === 'granted'
        ? text.notificationsBody.granted
        : text.notificationsBody.off;
  return (
    <Sheet {...sheet} title={text.notifications}>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        <Button
          label={text.notificationsDone}
          onClick={() => sheet.onOpenChange(false)}
        />
      </div>
    </Sheet>
  );
}
/** S4 672:23871 and states S4e/S4d/S4l/S4r; no mini board (owner, 13.10). */
export function AddOrder({
  records,
  onAdded,
  ...sheet
}: SheetProps & {
  records: OrderRecord[];
  onAdded: (record: OrderRecord) => void;
}) {
  return (
    <Sheet {...sheet} title={ordersContent.add} closeButton focusField>
      <AddOrderForm records={records} onAdded={onAdded} />
    </Sheet>
  );
}
function AddOrderForm({
  records,
  onAdded,
}: {
  records: OrderRecord[];
  onAdded: (record: OrderRecord) => void;
}) {
  const claim = useOrderClaim({ records, onSuccess: onAdded });
  return (
    <form
      className={styles.form}
      onSubmit={(event) => void claim.submit(event)}
      noValidate
    >
      <p className={styles.body}>{text.addBody}</p>
      <Input
        value={claim.number}
        onValueChange={claim.change}
        maxLength={6}
        error={claim.error || undefined}
        warning={claim.warning || undefined}
        disabled={claim.busy}
      />
      <Button
        type="submit"
        label={entryContent.submit}
        state={claim.busy ? 'loading' : 'default'}
      />
      <p role="status" className={styles.notice}>
        {claim.notice}
      </p>
    </form>
  );
}
