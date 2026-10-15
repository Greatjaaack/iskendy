import type { Emotion } from '../../content/emotion';
import { ratingContent } from '../../content/rating';
import { reviewContent } from '../../content/review';
import type { OrderRecord } from '../../storage/schemas';
import type { createRatingService, RatingOutcome } from './service';

export type RatingFlowState = {
  step: 1 | 2 | 3 | 4;
  /** Neutral selection is shown immediately (approved 15 October). */
  draft: {
    emotion: Emotion | null;
    tags: string[];
    comment: string;
    other?: string;
  };
  branch: 'positive' | 'negative';
  pending: boolean;
  canGoBack: boolean;
  failure?: RatingOutcome;
  already?: string;
};
type Dependencies = {
  service: ReturnType<typeof createRatingService>;
  record: OrderRecord;
  rated: () => void;
  detailed: () => void;
  finish: () => void | boolean;
};
/** Drafts live only in memory. Backend branch decides the positive/negative path. */
export function createRatingFlow({
  service,
  record,
  rated,
  detailed,
}: Dependencies) {
  const stored = record.fb?.rating;
  let state: RatingFlowState = {
    step: record.fb?.detailSent || record.done ? 4 : record.fb ? 2 : 1,
    draft: {
      emotion: stored && stored >= 1 && stored <= 5 ? (stored as Emotion) : 3,
      tags: [],
      comment: '',
    },
    branch: record.fb?.branch ?? 'negative',
    pending: false,
    canGoBack: false,
  };
  const history: RatingFlowState['step'][] = [];
  let appliedOther = '';
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<RatingFlowState>, remember = true) => {
    if (remember && patch.step !== undefined && patch.step !== state.step)
      history.push(state.step);
    const step = patch.step ?? state.step;
    // Thanks frames 556:14267/14278 have no navigation: the feedback is already sent.
    state = { ...state, ...patch, canGoBack: step !== 4 && history.length > 0 };
    for (const listener of listeners) listener();
  };
  const send = async (
    operation: () => Promise<RatingOutcome>,
    detail: boolean,
  ) => {
    if (state.pending) return;
    const attempt = ++generation;
    update({ pending: true, failure: undefined });
    try {
      const result = await operation();
      if (attempt !== generation) return;
      if (result.kind === 'saved') {
        if (detail) {
          update({ step: 4 });
          detailed();
        } else {
          const branch = result.record.fb!.branch;
          update({
            step: 2,
            branch,
            draft: {
              ...state.draft,
              tags: state.draft.tags.filter((tag) =>
                (
                  ratingContent.reasons[branch].tags as readonly string[]
                ).includes(tag),
              ),
            },
          });
          rated();
        }
      } else if (result.kind === 'already') {
        // Lost editToken cannot be reconstructed from check. Do not invent a saved rating or branch.
        update({ step: 4, already: result.message ?? ratingContent.thanks });
      } else if (
        detail &&
        result.kind === 'business' &&
        result.reason === 'expired'
      ) {
        // The existing rating was acknowledged before the details step; do not claim details delivery.
        update({ step: 4, already: reviewContent.ratingSavedHint });
      } else if (result.kind !== 'stale' && result.kind !== 'busy') {
        update({ failure: result });
      }
    } catch {
      if (attempt === generation)
        update({ failure: { kind: 'api', error: { kind: 'network' } } });
    } finally {
      if (attempt === generation) update({ pending: false });
    }
  };
  const detail = (tags: string[]) =>
    send(() => service.sendDetail(tags, state.draft.comment), true);
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    change(draft: RatingFlowState['draft']) {
      if (!state.pending) update({ draft, failure: undefined });
    },
    next(): Promise<void> {
      if (state.pending) return Promise.resolve();
      if (state.step === 1) {
        const emotion = state.draft.emotion;
        if (emotion === null) return Promise.resolve();
        return send(() => service.submit(emotion), false);
      }
      if (state.step === 2) {
        const other = state.draft.tags.includes('Другое')
          ? state.draft.other?.trim()
          : '';
        const previous =
          appliedOther && state.draft.comment.startsWith(appliedOther)
            ? state.draft.comment.slice(appliedOther.length).replace(/^\n/, '')
            : state.draft.comment;
        const comment = [other, previous]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1000);
        appliedOther = other || '';
        update({
          step: 3,
          draft: { ...state.draft, comment },
          failure: undefined,
        });
      } else if (state.step === 3) return detail(state.draft.tags);
      return Promise.resolve();
    },
    skip(): Promise<void> {
      if (state.pending || state.step !== 2) return Promise.resolve();
      update({
        draft: { ...state.draft, tags: [] },
        step: 3,
        failure: undefined,
      });
      return Promise.resolve();
    },
    back(): boolean {
      if (state.pending) return false;
      const previous = history.pop();
      if (previous === undefined) return true;
      update({ step: previous, failure: undefined }, false);
      return false;
    },
    cancel() {
      history.length = 0;
      generation++;
      service.cancel();
      update({ pending: false });
    },
  };
}
