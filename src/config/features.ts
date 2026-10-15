/** Defaults documented in ADR questions; release acceptance remains separate. */
/** Direct import lets the build omit the unused flag registry without changing defaults. */
export const guestOfflineAfterMs = 30_000;
export const features = {
  queueOnPhone: true, // Q-14
  guestOfflineAfterMs, // Q-01
  contactConsent: false,
  rateBlockBeforeDelay: true,
  telegramBot: false,
  offerCard: false,
  gameTile: true, // Owner approved static Soon card; no game route.
} as const;
