import { delay, http, HttpResponse } from 'msw';
import provenance from '../fixtures/SOURCE.json';

const fixtures = import.meta.glob('../fixtures/*.json', {
  eager: true,
  import: 'default',
});
const selected = new Map<string, string>();
let interactiveDemo = false;
export function setInteractiveDemo(enabled: boolean): void {
  interactiveDemo = enabled;
}
const delays = new Map<string, number>();
const heldResponses = new Map<
  string,
  { wait: Promise<void>; release: () => void }
>();
/** Test-only request start markers: paths only, never payloads or query strings. */
export const requestStarts: string[] = [];
const defaults: Record<string, string> = {
  '/api/status': 'status-populated',
  '/api/feedback/config': 'config-links',
  '/api/feedback/check': 'check-not-served',
  '/api/guest/claim': 'claim-ok',
  '/api/feedback': 'feedback-positive',
  '/api/feedback/rate': 'rate-ok',
  '/api/feedback/detail': 'detail-ok',
  '/api/feedback/files': 'feedback-files-ok',
  '/api/guest/message': 'message-ok',
  '/api/guest/event': 'guest-event-ok',
  '/api/client/event': 'client-event-ok',
};
export function setFixture(path: string, name: string): void {
  if (
    !(path in defaults) ||
    !Object.hasOwn(provenance.responses, name) ||
    provenance.responses[name as keyof typeof provenance.responses].path !==
      path
  )
    throw new Error('Invalid fixture selection');
  selected.set(path, name);
}
export function resetFixtures(): void {
  interactiveDemo = false;
  selected.clear();
  delays.clear();
  for (const gate of heldResponses.values()) gate.release();
  heldResponses.clear();
  requestStarts.length = 0;
}
/** Test-only timing control; response bytes and API provenance stay unchanged. */
export function setDelay(path: string, milliseconds: number): void {
  if (
    !(path in defaults) ||
    !Number.isInteger(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > 30000
  )
    throw new Error('Invalid fixture delay');
  delays.set(path, milliseconds);
}
/** Test-only response gate: requests remain pending until explicit release. */
export function holdResponse(path: string): void {
  if (!Object.hasOwn(defaults, path) || heldResponses.has(path))
    throw new Error('Invalid fixture response hold');
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  heldResponses.set(path, { wait, release });
}
export function releaseResponse(path: string): void {
  if (!Object.hasOwn(defaults, path))
    throw new Error('Invalid fixture response release');
  const gate = heldResponses.get(path);
  heldResponses.delete(path);
  gate?.release();
}
/** Same fixture transport for HTTP LAN previews where service workers are unavailable. */
export async function fixtureResponse(
  path: string,
  request?: Request,
): Promise<Response> {
  if (!Object.hasOwn(defaults, path))
    return new Response(null, { status: 501 });
  requestStarts.push(path);
  const name = selected.get(path) ?? defaults[path]!;
  let body = fixtures[`../fixtures/${name}.json`] as Record<string, unknown>;
  if (interactiveDemo && request) {
    const url = new URL(request.url);
    const payload =
      request.method === 'POST'
        ? ((await request
            .clone()
            .json()
            .catch(() => ({}))) as Record<string, unknown>)
        : {};
    const number = Number(payload.number ?? url.searchParams.get('number'));
    const rating = Number(payload.rating);
    // Demo data only. API response shape is copied from captured fixtures.
    // Branch threshold is the backend snapshot in docs/03, never product logic.
    if (path === '/api/feedback/check' && !selected.has(path) && number >= 990)
      body = {
        ...(fixtures['../fixtures/check-served-positive.json'] as object),
        number,
      };
    else if (path === '/api/feedback/check' && body.ok === true)
      body = { ...body, number };
    if (path === '/api/guest/claim' && body.ok === true)
      body = { ...body, number };
    if (path === '/api/feedback' && body.ok === true) {
      const template = fixtures[
        `../fixtures/feedback-${rating <= 3 ? 'negative' : 'positive'}.json`
      ] as Record<string, unknown>;
      body = {
        ...template,
        number,
        rating,
        feedbackId: number * 10 + rating,
        editToken: 'synthetic-demo-' + number,
      };
    }
    if (path === '/api/feedback/rate' && body.ok === true) {
      const template = fixtures[
        `../fixtures/feedback-${rating <= 3 ? 'negative' : 'positive'}.json`
      ] as Record<string, unknown>;
      body = { ...body, branch: template.branch, links: template.links };
    }
  }
  const meta = provenance.responses[name as keyof typeof provenance.responses];
  await heldResponses.get(path)?.wait;
  await delay(delays.get(path) ?? 0);
  return HttpResponse.json(body, { status: meta.httpStatus });
}
export const handlers = Object.entries(defaults).map(([path, defaultName]) => {
  const respond = ({ request }: { request: Request }) =>
    fixtureResponse(path, request);
  return provenance.responses[defaultName as keyof typeof provenance.responses]
    .method === 'GET'
    ? http.get(`*${path}`, respond)
    : http.post(`*${path}`, respond);
});

/** Abort-aware local transport for mobile HTTP previews, where SW cannot register. */
export async function localFixtureResponse(
  request: Request,
): Promise<Response> {
  const signal = request.signal;
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let abort = () => {};
  try {
    return await Promise.race([
      fixtureResponse(new URL(request.url).pathname, request),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
