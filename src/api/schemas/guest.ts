import * as z from 'zod/mini';

const number = z.int().check(z.minimum(1), z.maximum(100000));
const links = z.looseObject({
  yandex: z.optional(z.string()),
  '2gis': z.optional(z.string()),
  telegram: z.optional(z.string()),
  vk: z.optional(z.string()),
  instagram: z.optional(z.string()),
});
const branch = z.enum(['positive', 'negative']);
const failure = <T extends readonly [string, ...string[]]>(reasons: T) =>
  z.looseObject({
    ok: z.literal(false),
    reason: z.enum(reasons),
    message: z.optional(z.string()),
  });
const boardOrder = z.looseObject({
  number,
  status: z.enum(['open', 'preparing', 'ready']),
  acceptedAt: z.string(),
  readyAt: z.nullable(z.string()),
  servedAt: z.nullable(z.string()),
});
export const boardSchema = z.looseObject({
  date: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)),
  // backend db.kassa_number may store a till number as a string (Saby Presto) or above 100000.
  // A guest cannot enter such a number, so skip that row instead of failing the whole board.
  orders: z.pipe(
    z.array(z.unknown()),
    z.transform((items) =>
      items.flatMap((item) => {
        const parsed = boardOrder.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ),
  servedCount: z.int().check(z.nonnegative()),
  updatedAt: z.string(),
  now: z.string(),
});
export const healthSchema = z.looseObject({ ok: z.literal(true) });
export const configSchema = z.looseObject({
  promptDelaySec: z.number().check(z.nonnegative()),
  links,
});
export const claimSchema = z.discriminatedUnion('ok', [
  z.looseObject({
    ok: z.literal(true),
    claimToken: z.string().check(z.maxLength(64)),
    number,
  }),
  failure(['taken', 'too_many']),
]);
export const checkSchema = z.discriminatedUnion('ok', [
  z.looseObject({
    ok: z.literal(true),
    reason: z.null(),
    number,
    waitSeconds: z.nullable(z.number()),
  }),
  failure(['not_found', 'not_served', 'already']),
]);
export const feedbackSchema = z.discriminatedUnion('ok', [
  z.looseObject({
    ok: z.literal(true),
    feedbackId: z.int().check(z.positive()),
    editToken: z.string().check(z.maxLength(64)),
    branch,
    number,
    rating: z.int().check(z.minimum(1), z.maximum(5)),
    waitSeconds: z.nullable(z.number()),
    links,
  }),
  failure(['not_claimed', 'not_found', 'not_served', 'already']),
]);
export const rateSchema = z.discriminatedUnion('ok', [
  z.looseObject({ ok: z.literal(true), branch, links }),
  failure(['unknown_feedback', 'wrong_token', 'expired', 'locked']),
]);
export const detailSchema = z.discriminatedUnion('ok', [
  z.looseObject({ ok: z.literal(true) }),
  failure(['unknown_feedback', 'wrong_token', 'expired']),
]);
export const eventSchema = z.looseObject({ ok: z.boolean() });
export type Board = z.infer<typeof boardSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type FeedbackCheck = z.infer<typeof checkSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type FeedbackRate = z.infer<typeof rateSchema>;
export type FeedbackConfig = z.infer<typeof configSchema>;
