import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { setupServer } from 'msw/node';
import {
  handlers,
  resetFixtures,
  setFixture,
  holdResponse,
  releaseResponse,
  requestStarts,
} from '../msw/handlers';
import { getBoard, claimOrder } from '../../src/api/endpoints/guest';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(resetFixtures);
const localFetch: typeof fetch = (input, init) =>
  fetch(new URL(String(input), 'http://localhost'), init);
describe('MSW fixture runtime', () => {
  it('returns an actual captured board through the API client', async () => {
    const result = await getBoard({ fetcher: localFetch });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.orders).toHaveLength(10);
  });
  it('switches between a business rejection and 429 without changing schemas', async () => {
    setFixture('/api/guest/claim', 'claim-taken');
    expect(
      await claimOrder({ number: 112, guest: 'mock' }, { fetcher: localFetch }),
    ).toMatchObject({ ok: true, data: { ok: false, reason: 'taken' } });
    setFixture('/api/guest/claim', 'claim-429');
    expect(
      await claimOrder({ number: 112, guest: 'mock' }, { fetcher: localFetch }),
    ).toMatchObject({ ok: false, error: { kind: 'rate_limited' } });
  });
  it('holds a claim until release while other endpoints still respond', async () => {
    holdResponse('/api/guest/claim');
    let settled = false;
    const pending = claimOrder(
      { number: 112, guest: 'mock' },
      { fetcher: localFetch },
    );
    void pending.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(requestStarts).toContain('/api/guest/claim'));
    expect((await getBoard({ fetcher: localFetch })).ok).toBe(true);
    expect(settled).toBe(false);
    releaseResponse('/api/guest/claim');
    expect(await pending).toMatchObject({
      ok: true,
      data: { ok: true, number: 112 },
    });
  });
  it('reset releases pending responses and removes the hold', async () => {
    holdResponse('/api/guest/claim');
    const pending = claimOrder(
      { number: 112, guest: 'mock' },
      { fetcher: localFetch },
    );
    await vi.waitFor(() => expect(requestStarts).toContain('/api/guest/claim'));
    resetFixtures();
    expect((await pending).ok).toBe(true);
    expect(
      (
        await claimOrder(
          { number: 112, guest: 'mock' },
          { fetcher: localFetch },
        )
      ).ok,
    ).toBe(true);
  });
  it('rejects unknown and duplicate holds without blocking other fixtures', () => {
    for (const path of [
      '/api/unknown',
      'constructor',
      '__proto__',
      '/api/guest/claim?token=x',
    ]) {
      expect(() => holdResponse(path)).toThrow();
      expect(() => releaseResponse(path)).toThrow();
    }
    expect(() => releaseResponse('/api/unknown')).toThrow();
    holdResponse('/api/guest/claim');
    expect(() => holdResponse('/api/guest/claim')).toThrow();
    releaseResponse('/api/guest/claim');
    expect(() => releaseResponse('/api/guest/claim')).not.toThrow();
  });
  it('rejects unknown fixtures and endpoint mismatches', () => {
    expect(() => setFixture('/api/unknown', 'claim-ok')).toThrow();
    expect(() => setFixture('/api/status', 'claim-ok')).toThrow();
  });
});

describe('explicit interactive demo data', () => {
  it('keeps captured fixtures unchanged unless the demo is selected', async () => {
    const { fixtureResponse, setInteractiveDemo } =
      await import('../msw/handlers');
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ number: 998, rating: 3 }),
    });
    expect(
      await (await fixtureResponse('/api/feedback', request)).json(),
    ).toMatchObject({ number: 997, rating: 5 });
    setInteractiveDemo(true);
    for (const rating of [1, 2, 3, 4, 5]) {
      const response = await fixtureResponse(
        '/api/feedback',
        new Request('http://localhost/api/feedback', {
          method: 'POST',
          body: JSON.stringify({ number: 998, rating }),
        }),
      );
      expect(await response.json()).toMatchObject({
        ok: true,
        number: 998,
        rating,
        branch: rating <= 3 ? 'negative' : 'positive',
      });
    }
    expect(
      await (
        await fixtureResponse(
          '/api/feedback/check',
          new Request('http://localhost/api/feedback/check?number=998'),
        )
      ).json(),
    ).toMatchObject({ ok: true, number: 998 });
    setFixture('/api/guest/claim', 'claim-429');
    expect(
      (
        await fixtureResponse(
          '/api/guest/claim',
          new Request('http://localhost/api/guest/claim', {
            method: 'POST',
            body: '{"number":112}',
          }),
        )
      ).status,
    ).toBe(429);
  });
});

it('local HTTP preview honours cancellation and never forwards unknown API paths', async () => {
  const { localFixtureResponse, setDelay } = await import('../msw/handlers');
  const controller = new AbortController();
  setDelay('/api/guest/claim', 20);
  const result = localFixtureResponse(
    new Request('http://phone/api/guest/claim', {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    }),
  );
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(
    (await localFixtureResponse(new Request('http://phone/api/unknown')))
      .status,
  ).toBe(501);
});
