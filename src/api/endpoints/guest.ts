import { request, type RequestOptions } from '../client';
import {
  boardSchema,
  configSchema,
  claimSchema,
  checkSchema,
  feedbackSchema,
  rateSchema,
  detailSchema,
  eventSchema,
} from '../schemas/guest';

type ReadOptions = Pick<RequestOptions, 'signal' | 'fetcher'>;
export const getBoard = (options: ReadOptions = {}) =>
  request('/api/status', boardSchema, { ...options, timeoutMs: 6_000 });
export const getConfig = (options: ReadOptions = {}) =>
  request('/api/feedback/config', configSchema, options);
export const checkFeedback = (number: number, options: ReadOptions = {}) =>
  request(
    `/api/feedback/check?number=${encodeURIComponent(number)}`,
    checkSchema,
    options,
  );
export const claimOrder = (
  body: { number: number; guest: string },
  options: ReadOptions = {},
) => request('/api/guest/claim', claimSchema, { ...options, body });
export const createFeedback = (
  body: { number: number; rating: number; claim_token: string },
  options: ReadOptions = {},
) => request('/api/feedback', feedbackSchema, { ...options, body });
export const updateRating = (
  body: { feedback_id: number; edit_token: string; rating: number },
  options: ReadOptions = {},
) => request('/api/feedback/rate', rateSchema, { ...options, body });
export const sendFeedbackDetail = (
  body: {
    feedback_id: number;
    edit_token: string;
    tags?: string[];
    comment?: string;
    contact?: string;
  },
  options: ReadOptions = {},
) => request('/api/feedback/detail', detailSchema, { ...options, body });
export type GuestStep =
  | 'board_open'
  | 'sub_try'
  | 'sub_fail'
  | 'sub_ok'
  | 'sub_pending'
  | 'ready_seen'
  | 'rate_shown'
  | 'rated'
  | 'review_click';
export const sendGuestEvent = (
  body: {
    step: GuestStep;
    session: string;
    guest: string;
    number?: number | null;
  },
  options: ReadOptions = {},
) =>
  request('/api/guest/event', eventSchema, {
    ...options,
    body,
    keepalive: true,
  });
export const sendClientEvent = (
  body: { kind: 'offline' | 'render' | 'js'; screen: string; detail: string },
  options: ReadOptions = {},
) => request('/api/client/event', eventSchema, { ...options, body });
