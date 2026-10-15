import { checkFeedback } from './guest';
import { createFeedbackCheckGate } from '../../domain/rating/check-gate';
/** One guest-wide 20 second gate, shared by all callers of feedback/check. */
export const checkedFeedback = createFeedbackCheckGate(checkFeedback);
