import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

// @radix-ui/react-collection 1.1.16 gives otherwise unused local functions
// names using Object.defineProperty. Those calls keep its unused experimental
// collection in the bundle. Annotate only audited top-level local functions;
// The static block also names only its own local class. All
// calls that survive tree-shaking still run and retain their original names.
const reviewedSource =
  '162ee5f0412eb6c1bd8eb49a2100a9443408f1814f82976f4509db0751a1f1f7';

export function radixCollectionTreeShaking(): Plugin {
  return {
    name: 'reviewed-radix-collection-tree-shaking',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/@radix-ui/react-collection/dist/index.mjs')) return;
      // Future dependency releases must be reviewed; never apply assumptions
      // about this private helper to unknown source or other packages.
      if (createHash('sha256').update(code).digest('hex') !== reviewedSource)
        throw new Error(
          'Radix collection source changed: review name annotations.',
        );
      return {
        code: code
          .replace(/^__name\((\w+), "[^"]+"\);$/gm, '/* @__PURE__ */ $&')
          .replace(
            '    __name(this, "OrderedDict");',
            '    /* @__PURE__ */ __name(this, "OrderedDict");',
          ),
        map: null,
      };
    },
  };
}
