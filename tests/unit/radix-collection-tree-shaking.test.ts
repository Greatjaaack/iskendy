import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { radixCollectionTreeShaking } from '../../radix-collection-tree-shaking';

const id = '/node_modules/@radix-ui/react-collection/dist/index.mjs';
function transform() {
  const hook = radixCollectionTreeShaking().transform;
  if (typeof hook !== 'function') throw new Error('Missing transform hook');
  return hook.bind(null as never);
}

describe('reviewed Radix build boundary', () => {
  it('rejects dependency drift rather than applying private-helper assumptions', async () => {
    const source = await readFile(
      'node_modules/@radix-ui/react-collection/dist/index.mjs',
      'utf8',
    );
    expect(() => transform()(source + '\n// changed dependency', id)).toThrow(
      'source changed',
    );
  });
  it('leaves similarly named application and other dependency code alone', () => {
    const source = '__name(window, "changed");';
    expect(transform()(source, '/src/collection.ts')).toBeUndefined();
    expect(
      transform()(source, '/node_modules/other/dist/index.mjs'),
    ).toBeUndefined();
  });
  it('retains constructor name assignment and runtime calls in the reviewed dependency', async () => {
    const source = await readFile(
      'node_modules/@radix-ui/react-collection/dist/index.mjs',
      'utf8',
    );
    const result = transform()(source, id) as { code: string };
    expect(result.code).toContain(
      '    /* @__PURE__ */ __name(this, "OrderedDict");',
    );
    expect(result.code.replaceAll('/* @__PURE__ */ __name', '__name')).toBe(
      source.replaceAll('/* @__PURE__ */ __name', '__name'),
    );
  });
});
