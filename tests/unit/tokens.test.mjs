import { describe, it, expect } from 'vitest';
import {
  cssName,
  cssValue,
  generateTokens,
  loadGenerated,
} from '../../scripts/build-tokens.mjs';
import { checkSource, checkTokens } from '../../scripts/check-tokens.mjs';

describe('Figma token generation', () => {
  it('uses codeSyntax and documented inferred names without alias drift', () => {
    expect(cssName({ css: 'var(--iskendi-fg-primary)' }, 'semantic')).toBe(
      '--iskendi-fg-primary',
    );
    expect(cssName({ name: 'status/issued/bg' }, 'semantic')).toBe(
      '--color-status-issued-bg',
    );
    expect(cssName({ name: 'color/v4/paper' }, 'primitives')).toBe(
      '--prim-v4-paper',
    );
    expect(() => cssName({ name: 'bad', css: 'red' }, 'semantic')).toThrow();
    expect(() => cssName({ name: 'color/unknown' }, 'primitives')).toThrow();
  });
  it('resolves HEX alpha and dimensions exactly', () => {
    expect(cssValue({ type: 'COLOR', value: '#2d2d2b24' })).toBe(
      'rgb(45 45 43 / 0.141176)',
    );
    expect(cssValue({ type: 'FLOAT', value: 16 })).toBe('16px');
    expect(() => cssValue({ type: 'COLOR', value: 'red' })).toThrow();
  });
  it('rejects the wrong semantic mode', () => {
    expect(() => generateTokens({}, { mode: 'V3' }, {})).toThrow('V4');
  });
  it('reproduces the supplied exports deterministically, including italic typography', async () => {
    const generated = await loadGenerated();
    expect(generated.tokens).toContain('--iskendi-fg-primary: #43342b;');
    expect(generated.typography).toContain(
      'italic 600 32px/36px "Cormorant Garamond"',
    );
    expect(
      generated.inferred.filter((t) => t.part === 'semantic'),
    ).toHaveLength(11);
    expect(await loadGenerated()).toEqual(generated);
    expect(await checkTokens()).toEqual([]);
  });
});

describe('component token guard', () => {
  it.each([
    'color: #fff;',
    'color: rgb(0 0 0);',
    'color: red;',
    'color: var(--prim-v4-paper);',
    'padding: 16px;',
    'padding: 1px;',
    'transition: color 1s;',
    'color: var(--missing);',
  ])('rejects %s', (source) => {
    expect(
      checkSource(`.item { ${source} }`, 'test.module.css', new Set()),
    ).not.toHaveLength(0);
  });
  it('permits semantic tokens, currentColor and narrowly annotated Figma geometry', () => {
    expect(
      checkSource(
        '.item { color: currentColor; padding: var(--space-16); border-width: 1px; }',
        'test.module.css',
        new Set(['--space-16']),
      ),
    ).toEqual([]);
    expect(
      checkSource(
        '.item { width: 44px; /* figma: 67:44 */ }',
        'test.module.css',
      ),
    ).toEqual([]);
  });
});
