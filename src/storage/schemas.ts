import * as z from 'zod/mini';
const milliseconds = z.number().check(z.nonnegative());
export const orderRecordSchema = z.looseObject({
  n: z.int().check(z.minimum(1), z.maximum(100000)),
  d: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)),
  seen: z.optional(z.boolean()),
  subAt: z.optional(milliseconds),
  claim: z.optional(z.string().check(z.maxLength(64))),
  servedAt: z.optional(milliseconds),
  promptedAt: z.optional(milliseconds),
  rated: z.optional(z.boolean()),
  done: z.optional(z.boolean()),
  gone: z.optional(z.boolean()),
  lastStatus: z.optional(z.string()),
  fb: z.optional(
    z.looseObject({
      id: z.int().check(z.positive()),
      token: z.string().check(z.maxLength(64)),
      rating: z.int().check(z.minimum(1), z.maximum(5)),
      branch: z.enum(['positive', 'negative']),
      detailSent: z.optional(z.boolean()),
    }),
  ),
});
export type OrderRecord = z.infer<typeof orderRecordSchema>;
