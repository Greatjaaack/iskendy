/** Author values / explicit owner approval 2026-10-09. No speculative effects. */
export const motion = {
  loaderSeconds: 1.1,
  tickerPixelsPerSecond: 60,
  buttonSeconds: 0.12,
  buttonPressScale: 0.98,
  sliderSeconds: 0.24,
  dockSeconds: 0.18,
  // Owner request 15.10: gently enlarge clickable cards on hover.
  cardHoverScale: 1.02,
  controlHoverScale: 1.04,
  faqFlipSeconds: 0.28,
  cardHoverSeconds: 0.18,
  cursorFollowSeconds: 0.16,
  cursorStateSeconds: 0.24,
  linear: 'none',
  quietEase: 'power2.out',
} as const;
