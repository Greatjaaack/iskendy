import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ZodMiniType } from 'zod/mini';
import { readFileSync } from 'node:fs';
import { request } from '../../src/api/client';
import { errorDetail } from '../../src/api/errors';
import * as schemas from '../../src/api/schemas/guest';
import * as endpoints from '../../src/api/endpoints/guest';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fetcher = (response: Response) =>
  vi.fn<typeof fetch>().mockResolvedValue(response);
afterEach(() => vi.useRealTimers());

describe('captured response schemas', () => {
  const groups: [ZodMiniType, string[]][] = [
    [
      schemas.boardSchema,
      ['status-empty', 'status-populated', 'status-start-day'],
    ],
    [schemas.configSchema, ['config-empty', 'config-links']],
    [schemas.claimSchema, ['claim-ok', 'claim-taken', 'claim-too-many']],
    [
      schemas.checkSchema,
      ['check-ok', 'check-not-found', 'check-not-served', 'check-already'],
    ],
    [
      schemas.feedbackSchema,
      [
        'feedback-positive',
        'feedback-negative',
        'feedback-not-claimed',
        'feedback-not-found',
        'feedback-not-served',
        'feedback-already',
      ],
    ],
    [
      schemas.rateSchema,
      [
        'rate-ok',
        'rate-expired',
        'rate-locked',
        'rate-wrong-token',
        'rate-unknown-feedback',
      ],
    ],
    [
      schemas.detailSchema,
      [
        'detail-ok',
        'detail-expired',
        'detail-wrong-token',
        'detail-unknown-feedback',
      ],
    ],
    [
      schemas.eventSchema,
      ['guest-event-ok', 'guest-event-ignored', 'client-event-ok'],
    ],
  ];
  for (const [schema, names] of groups)
    it.each(names)('validates %s without inventing fields', (name) => {
      expect(schema.safeParse(read(name)).success).toBe(true);
    });
  it('preserves newly added fields', () => {
    expect(
      schemas.configSchema.parse({
        promptDelaySec: 0,
        links: {},
        future: true,
      }),
    ).toHaveProperty('future', true);
  });
});
describe('fetch boundary', () => {
  it('keeps business failures as successful transport data', async () => {
    const data = read('claim-taken');
    expect(
      await request('/api/guest/claim', schemas.claimSchema, {
        body: {},
        fetcher: fetcher(json(data)),
      }),
    ).toEqual({ ok: true, data });
  });
  it.each([401, 409, 422, 429, 500])('normalizes HTTP %s', async (status) => {
    const body =
      status === 422
        ? read('validation-422')
        : { detail: 'Safe server message' };
    const result = await request('/api/status', schemas.boardSchema, {
      fetcher: fetcher(json(body, status)),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.kind).toBe(status === 429 ? 'rate_limited' : 'http');
  });
  it('keeps the board usable when the till sends a non-numeric or out-of-range order', async () => {
    // backend db.kassa_number stores Saby Presto sale numbers as strings and does not cap integers.
    const order = (number: unknown, status = 'preparing') => ({
      number,
      status,
      acceptedAt: '2026-10-12T13:05:12+03:00',
      readyAt: null,
      servedAt: null,
    });
    const result = await request('/api/status', schemas.boardSchema, {
      fetcher: fetcher(
        json({
          date: '2026-10-12',
          orders: [
            order(108),
            order('П-0042'),
            order(123456),
            order(112, 'ready'),
          ],
          servedCount: 3,
          updatedAt: '',
          now: '13:08',
        }),
      ),
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.data.orders.map((item) => item.number)).toEqual([108, 112]);
  });
  it('accepts HTML gateway failures without parsing them as JSON', async () => {
    expect(
      await request('/api/status', schemas.boardSchema, {
        fetcher: fetcher(
          new Response('<html>bad gateway</html>', { status: 502 }),
        ),
      }),
    ).toEqual({ ok: false, error: { kind: 'http', status: 502 } });
  });
  it.each([
    new Response('{bad', { headers: { 'Content-Type': 'application/json' } }),
    json({ secret: 'never echo this' }),
    new Response('<html>'),
  ])('normalizes invalid data without leaking values', async (response) => {
    const result = await request('/api/status', schemas.boardSchema, {
      fetcher: fetcher(response),
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'schema' } });
    expect(JSON.stringify(result)).not.toContain('never echo this');
  });
  it('does not retry network failures', async () => {
    const call = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    expect(
      await request('/api/status', schemas.boardSchema, { fetcher: call }),
    ).toEqual({ ok: false, error: { kind: 'network' } });
    expect(call).toHaveBeenCalledOnce();
  });
  it('does not start canceled requests', async () => {
    const controller = new AbortController();
    controller.abort();
    const call = fetcher(json({}));
    expect(
      await request('/api/status', schemas.boardSchema, {
        signal: controller.signal,
        fetcher: call,
      }),
    ).toMatchObject({ error: { kind: 'aborted' } });
    expect(call).not.toHaveBeenCalled();
  });
  it.each(['timeout', 'aborted'] as const)(
    'handles %s during a request and removes listeners',
    async (kind) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const call = vi.fn<typeof fetch>(
        (_, options) =>
          new Promise((_, reject) =>
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('cancel')),
            ),
          ),
      );
      const result = request('/api/status', schemas.boardSchema, {
        signal: controller.signal,
        timeoutMs: 20,
        fetcher: call,
      });
      if (kind === 'timeout') await vi.advanceTimersByTimeAsync(20);
      else controller.abort();
      expect(await result).toEqual({ ok: false, error: { kind } });
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    },
  );
  it('rejects absolute endpoints and does not call fetch', async () => {
    const call = fetcher(json({}));
    expect(
      await request(
        'https://example.test/api/status' as '/api/status',
        schemas.boardSchema,
        { fetcher: call },
      ),
    ).toMatchObject({ error: { kind: 'schema' } });
    expect(call).not.toHaveBeenCalled();
  });
  it('normalizes unrecognized details without exposing arbitrary fields', () => {
    expect(errorDetail(null)).toBeUndefined();
    expect(errorDetail({})).toBeUndefined();
    expect(errorDetail({ detail: 42 })).toBeUndefined();
    expect(
      errorDetail({
        detail: [{ bad: true }, null, { msg: 'bad', loc: ['body', 0, {}] }],
      }),
    ).toEqual([{ msg: 'bad', loc: ['body', 0] }]);
  });
});
describe('guest endpoints', () => {
  it('uses the default fetch and read options', async () => {
    vi.stubGlobal('fetch', fetcher(json(read('status-empty'))));
    expect((await endpoints.getBoard()).ok).toBe(true);
    vi.unstubAllGlobals();
  });
  it('wires every endpoint to its own captured schema and request shape', async () => {
    const cases = [
      [
        'config-empty',
        (f: typeof fetch) => endpoints.getConfig({ fetcher: f }),
      ],
      [
        'check-ok',
        (f: typeof fetch) => endpoints.checkFeedback(112, { fetcher: f }),
      ],
      [
        'claim-ok',
        (f: typeof fetch) =>
          endpoints.claimOrder(
            { number: 112, guest: 'example' },
            { fetcher: f },
          ),
      ],
      [
        'feedback-positive',
        (f: typeof fetch) =>
          endpoints.createFeedback(
            { number: 112, rating: 5, claim_token: '<token>' },
            { fetcher: f },
          ),
      ],
      [
        'rate-ok',
        (f: typeof fetch) =>
          endpoints.updateRating(
            { feedback_id: 1, edit_token: '<token>', rating: 4 },
            { fetcher: f },
          ),
      ],
      [
        'detail-ok',
        (f: typeof fetch) =>
          endpoints.sendFeedbackDetail(
            { feedback_id: 1, edit_token: '<token>' },
            { fetcher: f },
          ),
      ],
      [
        'guest-event-ok',
        (f: typeof fetch) =>
          endpoints.sendGuestEvent(
            { step: 'board_open', guest: 'example', session: 'example' },
            { fetcher: f },
          ),
      ],
      [
        'client-event-ok',
        (f: typeof fetch) =>
          endpoints.sendClientEvent(
            { kind: 'offline', screen: 'board', detail: 'test' },
            { fetcher: f },
          ),
      ],
    ] as const;
    for (const [fixture, invoke] of cases) {
      const f = fetcher(json(read(fixture)));
      expect((await invoke(f)).ok).toBe(true);
      expect(f).toHaveBeenCalledOnce();
    }
  });
});
