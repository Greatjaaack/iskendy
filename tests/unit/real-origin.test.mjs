import { describe, expect, it, vi } from 'vitest';
import {
  backendRepository,
  ensureBackendReference,
  realTestOrigin,
} from '../../scripts/real-origin.mjs';
it('creates an unprivileged loopback origin by default', () => {
  expect(realTestOrigin()).toEqual({
    origin: 'http://127.0.0.1:8104',
    port: '8104',
  });
});
it('canonicalizes localhost without using arbitrary hostnames', () => {
  expect(realTestOrigin('http://localhost:8110')).toEqual({
    origin: 'http://127.0.0.1:8110',
    port: '8110',
  });
});
it.each([
  'https://example.test:8104',
  'http://example.test:8104',
  'http://localhost.example.test:8104',
  'http://user:pass@127.0.0.1:8104',
  'http://127.0.0.1:80',
  'http://127.0.0.1:5180',
  'http://127.0.0.1:5181',
  'http://127.0.0.1:5182',
  'http://127.0.0.1:8104/api',
  'http://127.0.0.1:8104/?token=value',
  'http://127.0.0.1:8104/#fragment',
  'not-a-url',
])('rejects unsafe or reserved test origin %s', (address) => {
  expect(() => realTestOrigin(address)).toThrow();
});
describe('pinned backend reference', () => {
  const commit = '166f35d63366a0da6551158fee4f2ba9760473c5';
  it('clones the reference at the pinned commit when it is missing', () => {
    const git = vi.fn();
    expect(
      ensureBackendReference('/cache/backend', commit, {
        exists: () => false,
        git,
      }),
    ).toBe('cloned');
    expect(git.mock.calls).toEqual([
      [
        [
          'clone',
          '--quiet',
          '--no-checkout',
          backendRepository,
          '/cache/backend',
        ],
      ],
      [['-C', '/cache/backend', 'checkout', '--quiet', '--detach', commit]],
    ]);
  });
  it('never touches an existing folder; pin and cleanliness are checked later', () => {
    const git = vi.fn();
    expect(
      ensureBackendReference('/cache/backend', commit, {
        exists: () => true,
        git,
      }),
    ).toBe('existing');
    expect(git).not.toHaveBeenCalled();
  });
});
