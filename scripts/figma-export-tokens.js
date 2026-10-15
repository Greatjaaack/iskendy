// Искенди · экспорт токенов из Figma — ТОЛЬКО ЧТЕНИЕ.
//
// Как запускать: через Figma MCP, инструмент `use_figma`,
//   fileKey = QDbhShERrxdg5nXHbrr27s, skillNames = figma-use.
// Скрипт выполняется трижды — по очереди с PART = 'primitives', 'semantic', 'text'
// (у ответа MCP лимит 20 КБ, целиком всё не помещается).
// Результаты сохранить как есть:
//   tokens/figma-primitives.json, tokens/figma-semantic.json, tokens/figma-text-styles.json
// Затем: npm run tokens && npm run check:tokens.
//
// Скрипт ничего не создаёт и не меняет в файле Figma.
// Проверен на файле 07.10.2026.

const PART = 'semantic'; // 'primitives' | 'semantic' | 'text'
const WEB_MODE = 'V4 · основной'; // режим коллекции Semantic для веба

const hex = (c) => {
  const h = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b) + (c.a !== undefined && c.a < 1 ? h(c.a) : '');
};

const vars = await figma.variables.getLocalVariablesAsync();
const byId = Object.fromEntries(vars.map((v) => [v.id, v]));
const cols = await figma.variables.getLocalVariableCollectionsAsync();

// Разрешить цепочку алиасов до конечного значения; запомнить первый алиас (примитив).
const resolve = (val) => {
  let cur = val;
  let alias = null;
  let guard = 0;
  while (cur && typeof cur === 'object' && cur.type === 'VARIABLE_ALIAS' && guard++ < 10) {
    const t = byId[cur.id];
    if (!t) return { value: null, alias };
    alias = alias || t.name;
    const col = cols.find((c) => c.id === t.variableCollectionId);
    cur = t.valuesByMode[col.defaultModeId];
  }
  return { value: cur && typeof cur === 'object' && 'r' in cur ? hex(cur) : cur, alias };
};

if (PART === 'text') {
  const styles = await figma.getLocalTextStylesAsync();
  return {
    part: PART,
    exportedAt: new Date().toISOString(),
    textStyles: styles
      .filter((s) => /^(Web\/|TV 768\/)/.test(s.name))
      .map((s) => ({
        name: s.name,
        family: s.fontName.family,
        style: s.fontName.style,
        size: s.fontSize,
        lineHeight: s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : null,
        letterSpacing:
          s.letterSpacing.unit === 'PERCENT' ? s.letterSpacing.value + '%' : s.letterSpacing.value + 'px',
      })),
  };
}

const colName = PART === 'primitives' ? 'Primitives' : 'Semantic';
const col = cols.find((c) => c.name === colName);
const mode =
  col.modes.find((m) => m.name === WEB_MODE) || col.modes.find((m) => m.modeId === col.defaultModeId);

return {
  part: PART,
  collection: col.name,
  mode: mode.name,
  exportedAt: new Date().toISOString(),
  tokens: col.variableIds
    .map((id) => byId[id])
    .filter(Boolean)
    .map((v) => {
      const r = resolve(v.valuesByMode[mode.modeId]);
      const o = { name: v.name, type: v.resolvedType, value: r.value };
      if (r.alias) o.alias = r.alias;
      if (v.codeSyntax && v.codeSyntax.WEB) o.css = v.codeSyntax.WEB;
      return o;
    }),
};
