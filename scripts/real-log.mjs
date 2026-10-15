/** Keep diagnostic artifacts useful without retaining credential fields. */
export function redactRealLog(value) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /(["']?(?:claimToken|editToken|claim_token|edit_token|token|password)["']?\s*[:=]\s*)(["'])(.*?)\2/gi,
      '$1$2[redacted]$2',
    )
    .replace(
      /((?:claimToken|editToken|claim_token|edit_token|token|password)\s*[:=]\s*)(?!["'])([^\s,;}]+)/gi,
      '$1[redacted]',
    );
}
