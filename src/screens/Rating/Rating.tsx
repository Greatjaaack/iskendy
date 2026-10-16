import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orderListHref } from '../../domain/order/routes';
import { navigateBack, useLocation } from '../../app/router';
import { RatingDialog } from '../../ui/RatingDialog/RatingDialog';
import type { Emotion } from '../../content/emotion';
import { createRatingService } from '../../domain/rating/service';
import { createRatingFlow } from '../../domain/rating/flow';
import {
  claimOrder,
  createFeedback,
  updateRating,
  sendFeedbackDetail,
} from '../../api/endpoints/guest';
import { checkedFeedback } from '../../api/endpoints/checked-feedback';
import {
  guestOrderStorage as orderStorage,
  createOrderBinding,
} from '../../storage/guestOrderStorage';
import type { OrderRecord } from '../../storage/schemas';
import type { Board } from '../../api/schemas/guest';
import { BOARD_KEY } from '../../polling/BoardPoller';
import { advanceOrder } from '../../domain/order/machine';
import { useGuestTelemetry } from '../../app/guest-telemetry-context';
import { ratingErrors, ratingNetworkError } from '../../content/rating-errors';

/** Mounted once per original order identity, across closing the dialog and board navigation. */
export function Rating({
  record,
  open,
  mapsHref,
}: {
  record: OrderRecord;
  open: boolean;
  mapsHref?: string;
}) {
  const client = useQueryClient();
  const telemetry = useGuestTelemetry();
  const [flow] = useState(() => {
    const binding = createOrderBinding(orderStorage, record);
    const read = () => {
      const current = binding.read();
      if (
        !current ||
        current.n !== record.n ||
        current.d !== record.d ||
        current.subAt !== record.subAt
      )
        return null;
      const state = advanceOrder(
        current,
        client.getQueryData<Board>(BOARD_KEY) ?? null,
        Date.now(),
      ).state;
      return state === 'issued' || state === 'rated' ? current : null;
    };
    const service = createRatingService({
      read,
      write: binding.write,
      guest: orderStorage.guestId,
      claim: async (body, options) => {
        const release = telemetry.beginClaim();
        try {
          return await claimOrder(body, options);
        } finally {
          release();
        }
      },
      create: createFeedback,
      rate: updateRating,
      detail: sendFeedbackDetail,
      check: checkedFeedback,
      eligible: checkedFeedback.recentlyEligible,
    });
    return createRatingFlow({
      service,
      record,
      rated: () => telemetry.rated(record.n),
      detailed: telemetry.detailed,
      finish: () => {
        const current = read();
        return current?.fb ? binding.write({ ...current, done: true }) : false;
      },
    });
  });
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  // UX-16: a face tapped on «Выдан» arrives as &emotion=N and starts R1 with it.
  const tapped = Number(
    new URLSearchParams(useLocation().search).get('emotion'),
  );
  useEffect(() => {
    if (!open || !(tapped >= 1 && tapped <= 5)) return;
    const current = flow.getSnapshot();
    if (current.step === 1)
      flow.change({ ...current.draft, emotion: tapped as Emotion });
  }, [open, tapped, flow]);
  useEffect(() => {
    if (open) telemetry.ratingShown(record.n);
    else flow.cancel();
    return () => flow.cancel();
  }, [open, flow, telemetry, record.n]);
  const close = () => {
    flow.cancel();
    navigateBack(orderListHref);
  };
  const failure = state.failure;
  const error =
    failure?.kind === 'business'
      ? failure.message || ratingErrors[failure.reason] || ratingNetworkError
      : failure?.kind === 'api' &&
          'detail' in failure.error &&
          typeof failure.error.detail === 'string'
        ? failure.error.detail
        : failure
          ? ratingNetworkError
          : undefined;
  return (
    <RatingDialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
      number={record.n}
      step={state.step}
      canGoBack={state.canGoBack}
      draft={state.draft}
      branch={state.branch}
      pending={state.pending}
      error={error}
      alreadyMessage={state.already}
      onDraftChange={flow.change}
      onNext={() => {
        void flow.next();
      }}
      onSkipRating={close}
      onSkip={() => {
        void flow.skip();
      }}
      onBack={() => {
        if (flow.back()) close();
      }}
      mapsHref={mapsHref}
      onReviewClick={telemetry.reviewClick}
      onRestoreFocus={() => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (
              document.querySelector<HTMLElement>('[data-rating-trigger]') ??
              document.querySelector<HTMLElement>('main h1, header h1')
            )?.focus({ preventScroll: true });
          }),
        );
      }}
    />
  );
}
