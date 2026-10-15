import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function cssName(token, part) {
  if (token.css) {
    const match = /^var\((--[a-z0-9-]+)\)$/.exec(token.css);
    if (!match) throw new Error(`Invalid CSS syntax: ${token.name}`);
    return match[1];
  }
  if (part === 'semantic') return `--color-${slug(token.name)}`;
  if (token.name.startsWith('color/v4/'))
    return `--prim-${slug(token.name.slice(6))}`;
  throw new Error(`Primitive has no approved CSS name: ${token.name}`);
}

export function cssValue(token) {
  if (
    token.type === 'FLOAT' &&
    typeof token.value === 'number' &&
    Number.isFinite(token.value)
  )
    return `${token.value}px`;
  if (
    token.type !== 'COLOR' ||
    !/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(token.value)
  )
    throw new Error(`Invalid value: ${token.name}`);
  if (token.value.length === 7) return token.value.toLowerCase();
  const [r, g, b, a] = token.value
    .slice(1)
    .match(/../g)
    .map((hex) => parseInt(hex, 16));
  return `rgb(${r} ${g} ${b} / ${Number((a / 255).toFixed(6))})`;
}

export function generateTokens(primitives, semantic, text) {
  if (semantic.mode !== 'V4 · основной')
    throw new Error('Only the V4 semantic mode is supported.');
  const names = new Set();
  const inferred = [];
  const declarations = [primitives, semantic].flatMap((part) =>
    part.tokens.map((token) => {
      const name = cssName(token, part.part);
      if (names.has(name)) throw new Error(`Duplicate token: ${name}`);
      names.add(name);
      if (!token.css)
        inferred.push({ token: token.name, css: name, part: part.part });
      return `  ${name}: ${cssValue(token)};`;
    }),
  );
  const weights = {
    Black: 900,
    Bold: 700,
    Regular: 400,
    'SemiBold Italic': 600,
  };
  const typeNames = new Set();
  const typography = text.textStyles.map((style) => {
    const weight = weights[style.style];
    if (
      !weight ||
      style.letterSpacing !== '0%' ||
      !Number.isFinite(style.size) ||
      !Number.isFinite(style.lineHeight)
    )
      throw new Error(`Unsupported text style: ${style.name}`);
    const name = `--t-${slug(style.name)}`;
    if (typeNames.has(name)) throw new Error(`Duplicate text style: ${name}`);
    typeNames.add(name);
    const italic = style.style.includes('Italic') ? 'italic ' : '';
    const fallback =
      style.family === 'Cormorant Garamond'
        ? 'Georgia, serif'
        : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    return `  ${name}: ${italic}${weight} ${style.size}px/${style.lineHeight}px "${style.family}", ${fallback};`;
  });
  const header = (dates) =>
    `/* Generated from Figma exports ${dates.join(', ')}. Do not edit. */\n`;
  return {
    tokens: `${header([primitives.exportedAt, semantic.exportedAt])}:root {\n${declarations.join('\n')}\n}\n`,
    typography: `${header([text.exportedAt])}:root {\n${typography.join('\n')}\n}\n`,
    inferred,
  };
}

export async function loadGenerated(root = process.cwd()) {
  const inputs = await Promise.all(
    ['primitives', 'semantic', 'text-styles'].map(async (part) =>
      JSON.parse(
        await readFile(resolve(root, `tokens/figma-${part}.json`), 'utf8'),
      ),
    ),
  );
  return generateTokens(...inputs);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const generated = await loadGenerated();
  await mkdir('src/styles', { recursive: true });
  await writeFile('src/styles/tokens.css', generated.tokens);
  await writeFile('src/styles/typography.css', generated.typography);
  console.log(
    `Generated 166 design tokens and 29 typography styles. Inferred names (Q-13 for semantic):`,
  );
  for (const token of generated.inferred)
    console.log(`${token.token} → ${token.css}`);
}
