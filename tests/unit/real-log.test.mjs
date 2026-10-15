import { expect, it } from 'vitest';
import { redactRealLog } from '../../scripts/real-log.mjs';
it('redacts authorization and quoted API credentials in failed request diagnostics', () => {
  const result = redactRealLog(
    'authorization: Bearer synthetic.jwt.token\n{"claimToken":"claim-secret","edit_token":"edit-secret","password":"password-secret"}',
  );
  expect(result).not.toMatch(
    /synthetic\.jwt\.token|claim-secret|edit-secret|password-secret/,
  );
  expect(result).toContain('authorization: Bearer [redacted]');
});
it('redacts single quoted and unquoted credential fields', () => {
  const result = redactRealLog(
    "claim_token: 'claim-secret' token=edit-secret password=password-secret",
  );
  expect(result).not.toMatch(/claim-secret|edit-secret|password-secret/);
  expect(result).toContain('[redacted]');
});
it('keeps status codes, endpoints and non-secret diagnostics intact', () => {
  const log = 'POST /api/feedback 429; reason=not_claimed; No tokens logged.';
  expect(redactRealLog(log)).toBe(log);
});
