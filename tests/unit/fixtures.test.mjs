import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (name) =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
const source = read('SOURCE');
describe('captured backend response provenance', () => {
  it('contains every recorded response and expected status without accidental throttling', () => {
    expect(Object.keys(source.responses)).toHaveLength(38);
    for (const [name, info] of Object.entries(source.responses)) {
      expect(read(name)).toBeDefined();
      expect(info.httpStatus).toBe(
        name === 'claim-429'
          ? 429
          : name === 'validation-422'
            ? 422
            : name === 'message-503'
              ? 503
              : 200,
      );
    }
  });
  it('captures public rate output rather than the internal database object', () => {
    expect(Object.keys(read('rate-ok')).sort()).toEqual([
      'branch',
      'links',
      'ok',
    ]);
  });
  it.each(['claim-ok', 'feedback-positive', 'feedback-negative'])(
    'redacts tokens in %s',
    (name) => {
      for (const [key, value] of Object.entries(read(name)))
        if (/token/i.test(key)) expect(value).toBe('<token>');
    },
  );
  it.each([
    'taken',
    'too-many',
    'not-found',
    'not-served',
    'already',
    'not-claimed',
    'expired',
    'wrong-token',
    'locked',
  ])('captures business outcome %s', (reason) => {
    expect(
      Object.keys(source.responses).some(
        (name) =>
          name.endsWith(reason) &&
          read(name).reason === reason.replaceAll('-', '_'),
      ),
    ).toBe(true);
  });
});
