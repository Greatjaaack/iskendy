import { expect, it } from 'vitest';
import { createGuestEvents } from '../../src/platform/guestEvents';
it('attributes background readiness to its own order while retaining the selected order', async () => {
  const calls: unknown[] = [];
  const events = createGuestEvents(
    {
      readOrder: () => ({ n: 112, d: '2026-10-07' }),
      guestId: () => 'synthetic',
      visitId: () => 'visit',
    },
    async (body) => {
      calls.push(body);
      return { ok: true, data: { ok: true } };
    },
  );
  events('ready_seen', 128);
  events('ready_seen', 128);
  expect(calls).toEqual([
    { step: 'ready_seen', session: 'visit', guest: 'synthetic', number: 128 },
  ]);
});
