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
  healthSchema,
  sentSchema,
  feedbackFilesSchema,
} from '../schemas/guest';

type ReadOptions = Pick<RequestOptions, 'signal' | 'fetcher'>;
export const getBoard = (options: ReadOptions = {}) =>
  request('/api/status', boardSchema, { ...options, timeoutMs: 6_000 });
export const getHealth = (options: ReadOptions = {}) =>
  request('/api/health', healthSchema, { ...options, timeoutMs: 6_000 });
/** Same image as the legacy TV: server-side QR of this site's /board. */
export const boardQrSrc = (origin: string) =>
  `/api/qr?border=1&data=${encodeURIComponent(`${origin}/board`)}`;
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
/** Files go straight to the team chat; the slow hall Wi-Fi gets two minutes. */
const UPLOAD_TIMEOUT_MS = 120_000;
const withFiles = (fields: Record<string, string>, files: readonly File[]) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) form.append('files', file, file.name);
  return form;
};
export const sendManagerMessage = (
  body: { text: string; number?: string; files: readonly File[] },
  options: ReadOptions = {},
) =>
  request('/api/guest/message', sentSchema, {
    ...options,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    body: withFiles({ text: body.text, number: body.number ?? '' }, body.files),
  });
export const sendFeedbackFiles = (
  body: { feedback_id: number; edit_token: string; files: readonly File[] },
  options: ReadOptions = {},
) =>
  request('/api/feedback/files', feedbackFilesSchema, {
    ...options,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    body: withFiles(
      { feedback_id: String(body.feedback_id), edit_token: body.edit_token },
      body.files,
    ),
  });
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
