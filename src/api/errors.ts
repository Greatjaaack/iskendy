export type ValidationIssue = {
  type?: string;
  loc: (string | number)[];
  msg: string;
};
export type ApiError =
  | { kind: 'network' | 'timeout' | 'aborted' }
  | { kind: 'rate_limited'; detail?: string }
  | { kind: 'http'; status: number; detail?: string | ValidationIssue[] }
  | { kind: 'schema'; issues: string[] };
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

export function errorDetail(
  data: unknown,
): string | ValidationIssue[] | undefined {
  if (!data || typeof data !== 'object' || !('detail' in data))
    return undefined;
  if (typeof data.detail === 'string') return data.detail;
  if (!Array.isArray(data.detail)) return undefined;
  return data.detail.flatMap((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('msg' in item) ||
      typeof item.msg !== 'string' ||
      !('loc' in item) ||
      !Array.isArray(item.loc)
    )
      return [];
    return [
      {
        msg: item.msg,
        loc: item.loc.filter(
          (part: unknown): part is string | number =>
            typeof part === 'string' || typeof part === 'number',
        ),
        ...('type' in item && typeof item.type === 'string'
          ? { type: item.type }
          : {}),
      },
    ];
  });
}
