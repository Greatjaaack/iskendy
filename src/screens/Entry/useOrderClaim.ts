import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { entryContent as text } from '../../content/entry';
import { inputContent } from '../../content/input';
import { ordersContent } from '../../content/orders';
import { statusContent } from '../../content/status';
import { useBoard, waitForBoard } from '../../polling/BoardPoller';
import { createSubscriptionService } from '../../domain/order/subscribe';
import { claimOrder } from '../../api/endpoints/guest';
import { checkedFeedback } from '../../api/endpoints/checked-feedback';
import { guestOrderStorage as orderStorage } from '../../storage/guestOrderStorage';
import type { OrderRecord } from '../../storage/schemas';
import { useGuestSignals } from '../../app/guest-signals-context';
import { useGuestTelemetry } from '../../app/guest-telemetry-context';

/** One explicit claim per submit; shared by «Где мой заказ?» and «Добавить заказ». */
export function useOrderClaim({
  records = [],
  initialNumber = '',
  initialError = '',
  onSuccess,
}: {
  records?: OrderRecord[];
  initialNumber?: string;
  initialError?: string;
  onSuccess: (record: OrderRecord) => void;
}) {
  const signals = useGuestSignals();
  const telemetry = useGuestTelemetry();
  const client = useQueryClient();
  const board = useBoard();
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const [number, setNumber] = useState(initialNumber),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    // A hall-wide 429 is not the guest's mistake: neutral note, valid field (UX-05).
    [notice, setNotice] = useState('');
  // S4d 677:24048: an order already in «Мои заказы» is a warning, not a second claim.
  const existing = records.find((record) => String(record.n) === number);
  const warning = existing ? ordersContent.already(number) : '';
  function change(value: string) {
    setNumber(value);
    setError('');
    setNotice('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    if (existing) {
      orderStorage.select(existing);
      onSuccess(existing);
      return;
    }
    const attempt = new AbortController();
    const releaseTelemetry = telemetry.beginSubscription();
    request.current = attempt;
    const subscribe = createSubscriptionService({
      check: (value) => checkedFeedback(value, { signal: attempt.signal }),
      claim: (body) => claimOrder(body, { signal: attempt.signal }),
    });
    void signals.unlockFromGesture().catch(() => {});
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // B1: a tap before the first /api/status answer waits for it instead of «Нет связи».
      const current = board ?? (await waitForBoard(client, attempt.signal));
      if (!mounted.current || attempt.signal.aborted) return;
      const result = await subscribe(
        number,
        current,
        orderStorage.guestId(),
        Date.now(),
      );
      if (!mounted.current || attempt.signal.aborted) return;
      if (result.ok) {
        if (!orderStorage.add(result.record)) {
          telemetry.subscriptionFailed();
          setError(statusContent.offline.label);
          return;
        }
        signals.subscribed();
        telemetry.subscribed({
          pending: result.pending,
          alreadyServed: result.alreadyServed,
        });
        if (!result.record.rated && !result.record.done)
          void signals
            .requestPermissionFromGesture(telemetry.permission)
            .catch(() => {});
        onSuccess(result.record);
      } else if (result.error?.kind === 'rate_limited') {
        telemetry.subscriptionFailed();
        setNotice(text.rateLimited);
      } else if (result.reason !== 'busy') {
        telemetry.subscriptionFailed();
        setError(
          result.message ||
            (result.error &&
            'detail' in result.error &&
            typeof result.error.detail === 'string'
              ? result.error.detail
              : result.reason === 'invalid'
                ? inputContent.invalidNumber
                : statusContent.offline.label),
        );
      }
    } finally {
      releaseTelemetry();
      if (request.current === attempt) {
        request.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }
  return { number, change, busy, error, notice, warning, submit };
}
