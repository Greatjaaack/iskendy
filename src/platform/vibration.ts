export function vibrate(
  pattern: number | number[],
  target: Pick<Navigator, 'vibrate'> = navigator,
): void {
  try {
    target.vibrate?.(pattern);
  } catch {
    /* Unsupported or blocked: status and audio remain. */
  }
}
export const vibrationPatterns = {
  subscribed: 30,
  ready: [90, 70, 90, 70, 160],
  rating: [60, 60, 60],
} as const;
