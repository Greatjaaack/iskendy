import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGenerated } from './build-tokens.mjs';

const colorNames = new Set(
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgrey darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgrey lightgreen lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' ',
  ),
);

export function checkSource(source, file, knownNames = null) {
  const errors = [];
  const css = file.endsWith('.css');
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    const plain = line.replace(/\/\*.*?\*\//g, '');
    const error = (message) => errors.push(`${file}:${index + 1}: ${message}`);
    if (/#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i.test(plain))
      error('Literal color; use a semantic token.');
    if (/var\(\s*--(?:brand-|prim-|iskendi-color-)/.test(plain))
      error('Primitive token is forbidden in components.');
    if (
      /\b(?:transition(?:-[a-z]+)?|animation(?:-[a-z]+)?)\s*:|@keyframes/.test(
        plain,
      )
    )
      error('Motion is deferred until phase 7.');
    if (
      !/\/\*\s*figma:\s*\d+[:-]\d+\s*\*\//.test(line) &&
      [...plain.matchAll(/\b(\d+(?:\.\d+)?)px\b/g)].some((match) => {
        const declaration =
          plain.slice(0, match.index).split(/[;{}]/).at(-1) ?? '';
        return (
          match[1] !== '1' || !/^\s*border(?:-[a-z-]+)?\s*:/i.test(declaration)
        );
      })
    )
      error('Unannotated px value; use a token or exact Figma reference.');
    const values = css
      ? plain.slice(plain.indexOf(':') + 1).replace(/var\([^)]*\)/g, '')
      : [...plain.matchAll(/['"]([a-z]+)['"]/g)]
          .map((match) => match[1])
          .join(' ');
    if (
      [...values.matchAll(/\b[a-z]+\b/gi)].some((match) =>
        colorNames.has(match[0].toLowerCase()),
      )
    )
      error('Named color; use a semantic token.');
    if (knownNames)
      for (const match of plain.matchAll(/var\(\s*(--[a-z0-9-]+)/g))
        if (!knownNames.has(match[1])) error(`Unknown token ${match[1]}.`);
  });
  return errors;
}

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(`${path}/${entry.name}`)
          : [`${path}/${entry.name}`],
      ),
    )
  ).flat();
}

export async function checkTokens(root = process.cwd()) {
  const generated = await loadGenerated(root);
  const errors = [];
  for (const [filename, expected] of [
    ['tokens.css', generated.tokens],
    ['typography.css', generated.typography],
  ]) {
    const actual = await readFile(
      resolve(root, 'src/styles', filename),
      'utf8',
    );
    if (actual !== expected)
      errors.push(`${filename} is stale; run npm run tokens.`);
  }
  const known = new Set(
    [
      ...`${generated.tokens}\n${generated.typography}`.matchAll(
        /(--[a-z0-9-]+):/g,
      ),
    ].map((match) => match[1]),
  );
  for (const file of await walk(resolve(root, 'src'))) {
    if (
      (file.endsWith('.css') && !/\/(tokens|typography)\.css$/.test(file)) ||
      file.endsWith('.tsx')
    )
      errors.push(...checkSource(await readFile(file, 'utf8'), file, known));
  }
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const errors = await checkTokens();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log('Token freshness, semantic usage and no-motion checks passed.');
}
