export function nextInterval({
  visible,
  failures,
  audience,
}: {
  visible: boolean;
  failures: number;
  audience: 'guest' | 'staff' | 'tv';
}): number {
  if (!visible) return 20_000;
  const exponent = Math.min(4, Math.max(0, failures - 1));
  return Math.min(
    audience === 'staff' ? 10_000 : 60_000,
    5_000 * 2 ** exponent,
  );
}
