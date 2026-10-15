import { errorDetail, type ApiResult } from './errors';

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  body?: unknown;
  keepalive?: boolean;
  fetcher?: typeof fetch;
};

export async function request<T>(
  endpoint: `/api/${string}`,
  schema: {
    safeParse(input: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { path: PropertyKey[]; code: string }[] };
        };
  },
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  if (!endpoint.startsWith('/api/') || endpoint.includes('://'))
    return {
      ok: false,
      error: { kind: 'schema', issues: ['Invalid endpoint'] },
    };
  if (options.signal?.aborted) return { ok: false, error: { kind: 'aborted' } };
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    options.timeoutMs ?? (options.body === undefined ? 8_000 : 10_000),
  );
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: options.body === undefined ? 'GET' : 'POST',
      ...(options.body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options.body),
          }),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive: options.keepalive ?? false,
    });
    const text = await response.text();
    let data: unknown;
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }
    if (!response.ok) {
      const detail = errorDetail(data);
      return {
        ok: false,
        error:
          response.status === 429
            ? {
                kind: 'rate_limited',
                ...(typeof detail === 'string' ? { detail } : {}),
              }
            : {
                kind: 'http',
                status: response.status,
                ...(detail === undefined ? {} : { detail }),
              },
      };
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      return {
        ok: false,
        error: {
          kind: 'schema',
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.code}`,
          ),
        },
      };
    return { ok: true, data: parsed.data };
  } catch {
    return {
      ok: false,
      error: {
        kind: timedOut
          ? 'timeout'
          : controller.signal.aborted
            ? 'aborted'
            : 'network',
      },
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
