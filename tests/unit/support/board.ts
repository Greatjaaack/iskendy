import { act, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
/** Q-14: the entry no longer shows the queue, so wait for the board request itself. */
export async function boardLoaded() {
  await waitFor(() =>
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(([url]) => String(url).includes('/api/status')),
    ).toBe(true),
  );
  await act(async () => {});
}
