// generateCSS.ts
// ———————————————————————————————————————————————

export type GenerateCSSOptions = {
  includeTextStyles: boolean;
  includePaintStyles: boolean;
  includeEffectStyles: boolean;
  includeVariables: boolean;
  selectedCollectionIds?: string[];
  preferTokenRefs?: boolean;
  numberUnit?: string; // default "px"
};

export type GeneratedCSSFiles = {
  collections: Record<string, string>; // <CollectionName>.css or <CollectionName>-<ModeName>.css
  styles?: string; // Styles.css (paint, effect, text styles)
};

type VariableMode = { modeId: string; name: string };

type Payload = {
  textStyles?: any[];
  paintStyles?: any[];
  effectStyles?: any[];
  variables?: Array<{
    id?: string;
    name: string;
    resolvedType: string;
    valuesByMode: Record<string, any>;
    variableCollectionId?: string;
  }>;
  variableModes?: VariableMode[];
  collections?: Array<{ id: string; name: string; modes: VariableMode[] }>;
};

/* ============================= helpers ============================= */

const NUMBER_LIKE_TYPES = new Set([
  "NUMBER","FLOAT","INT","SPACING","SIZE","DIMENSION","RADIUS","BORDER_WIDTH",
  "LINE_HEIGHT","LETTER_SPACING","OPACITY","Z_INDEX","FONT_SIZE","FONT_WEIGHT",
]);

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object";
const isAlias = (v: any): v is { type: "VARIABLE_ALIAS"; id: string } =>
  isObj(v) && v.type === "VARIABLE_ALIAS" && typeof v.id === "string";

function kebab(name: string): string {
  return name
    .replace(/[\/\s]+/g, "-")
    .replace(/([A-Z])/g, "-$1")
    .replace(/--+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

function toCssVarName(name: string): string {
  // Convert names to safe CSS variable names:
  // - Replace slashes/spaces/other non-alphanumeric chars with hyphens
  // - Collapse multiple hyphens
  // - Lowercase the result and trim hyphens
  // Examples:
  // "button/extraLarge/cornerRadius" -> "button-extralarge-cornerradius"
  // "VariableID:2702:7787" -> "variableid-2702-7787"
  if (!name) return "";
  return name
    .replace(/[\/\s]+/g, "-")
    // replace any characters that are not letters (keep case), digits, underscore or hyphen
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function to1Smart(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
function to1Fixed(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function quoteFontFamily(f?: string): string | undefined {
  if (!f) return undefined;
  return /[^a-z0-9-]/i.test(f) ? `"${f}"` : f;
}
function normalizeFamilyName(s?: string): string | undefined {
  if (!s) return undefined;
  const first = s.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return first?.toLowerCase();
}

function rgbaFromColor(raw: any): string {
  const r = Math.round((raw?.r ?? 0) * 255);
  const g = Math.round((raw?.g ?? 0) * 255);
  const b = Math.round((raw?.b ?? 0) * 255);
  const a = typeof raw?.a === "number" ? to1Fixed(raw.a) : "1.0";
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function lineHeightToCss(lh: any): string | undefined {
  if (!lh) return undefined;
  if (lh.unit === "AUTO") return "normal";
  if (lh.unit === "PERCENT") return `${to1Smart(lh.value ?? 0)}%`;
  if (lh.unit === "PIXELS") return `${to1Smart(lh.value ?? 0)}px`;
  if (typeof lh === "number") return Number.isInteger(lh) ? String(lh) : to1Smart(lh);
  return undefined;
}
function letterSpacingToCss(ls: any): string | undefined {
  if (!ls) return undefined;
  if (ls.unit === "PERCENT") return `${to1Smart(ls.value ?? 0)}%`;
  if (ls.unit === "PIXELS") return `${to1Smart(ls.value ?? 0)}px`;
  if (typeof ls === "number") return `${to1Smart(ls)}px`;
  return undefined;
}

function weightNameToNumber(w?: string): number | undefined {
  if (!w) return undefined;
  const s = w.toLowerCase().replace(/\s+/g, "");
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s.includes("normal")) return 400;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("demi")) return 600;
  if (s.includes("bold")) return 700;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  return undefined;
}
function normalizeWeightKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "").replace(/semi\s*bold/, "semibold");
}
function buildWeightVarIndex(variables: Payload["variables"] | undefined): Map<string, string> {
  const idx = new Map<string, string>();
  if (!variables) return idx;
  const labelSet = new Set([
    "thin","extralight","ultralight","light","regular","normal","medium",
    "semibold","demibold","bold","extrabold","ultrabold","black","heavy",
  ]);
  for (const v of variables) {
    if (!v?.name) continue;
    const keb = kebab(v.name);
    const last = v.name.split(/[\/\\]/).pop() || v.name;
    const key = normalizeWeightKey(last);
    const looks = /font.*weight|weight.*font/i.test(v.name) || labelSet.has(key);
    const isNum = ["NUMBER","FLOAT","INT"].includes((v.resolvedType||"").toUpperCase());
    if (looks && isNum) {
      idx.set(key, `--${keb}`);
      if (key === "regular") idx.set("normal", `--${keb}`);
    }
  }
  return idx;
}

/* -------- alias resolution -------- */

type VarById = Map<string, {
  id?: string;
  name: string;
  resolvedType: string;
  valuesByMode: Record<string, any>;
}>;

function resolveAliasChainToPrimitive(
  value: any,
  modeId: string | undefined,
  varById: VarById,
  seen: Set<string> = new Set(),
  depth = 0
): any {
  if (!isAlias(value)) return value;
  if (depth > 20) return value;
  const target = varById.get(value.id);
  if (!target) return value;
  if (target.id && seen.has(target.id)) return value;
  if (target.id) seen.add(target.id);

  const modeVal =
    (modeId && typeof target.valuesByMode?.[modeId] !== "undefined"
      ? target.valuesByMode[modeId]
      : Object.values(target.valuesByMode ?? {}).find((v) => typeof v !== "undefined"));

  return resolveAliasChainToPrimitive(modeVal, modeId, varById, seen, depth + 1);
}

function buildFamilyToVarMap(payload: Payload): Map<string,string> {
  const map = new Map<string,string>(); // normalized family → var name
  const { variables = [], collections = [], variableModes = [] } = payload;

  const varById: VarById = new Map();
  for (const v of variables ?? []) if (v?.id) varById.set(v.id, v as any);

  let allModes: VariableMode[] = [];
  const seen = new Set<string>();
  for (const c of collections ?? []) {
    for (const m of c.modes ?? []) {
      const key = `${m.modeId}::${m.name}`;
      if (!seen.has(key)) { seen.add(key); allModes.push(m); }
    }
  }
  if (!allModes.length) allModes = variableModes ?? [];

  const isPrimaryName = (n: string) => /font[-\s_]*family.*primary/i.test(n);
  const isSecondaryName = (n: string) => /font[-\s_]*family.*secondary/i.test(n);

  const push = (raw: any, modeId: string | undefined, varName: string) => {
    const term = resolveAliasChainToPrimitive(raw, modeId, varById);
    if (typeof term === "string") {
      const norm = normalizeFamilyName(term);
      if (norm) map.set(norm, varName);
    }
  };

  for (const v of variables ?? []) {
    if (!v?.name) continue;
    const keb = `--${kebab(v.name)}`;
    if (isPrimaryName(v.name)) {
      if (allModes.length) for (const m of allModes) push(v.valuesByMode?.[m.modeId], m.modeId, "--font-family-primary");
      else push(Object.values(v.valuesByMode ?? {})[0], undefined, "--font-family-primary");
    }
    if (isSecondaryName(v.name)) {
      if (allModes.length) for (const m of allModes) push(v.valuesByMode?.[m.modeId], m.modeId, "--font-family-secondary");
      else push(Object.values(v.valuesByMode ?? {})[0], undefined, "--font-family-secondary");
    }
  }

  return map;
}

/* -------- generic value formatter -------- */

function formatValue(
  raw: any,
  resolvedType: string,
  numberUnit: string,
  preferTokenRefs: boolean,
  idToName: Map<string, string>
): string {
  if (isAlias(raw)) {
    const aliasName = idToName.get(raw.id);
    return `var(--${toCssVarName(aliasName ?? raw.id)})`;
  }
  if ((resolvedType || "").toUpperCase() === "COLOR" && isObj(raw) &&
      typeof raw.r === "number" && typeof raw.g === "number" && typeof raw.b === "number") {
    return rgbaFromColor(raw);
  }
  if (NUMBER_LIKE_TYPES.has((resolvedType||"").toUpperCase()) || typeof raw === "number") {
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(num)) return !numberUnit || numberUnit === "none" ? `${num}` : `${to1Smart(num)}${numberUnit}`;
  }
  return String(raw);
}

/* ============================= sections ============================= */

function emitVariablesSection(payload: Payload, opt: GenerateCSSOptions): string {
  const { variables = [], variableModes = [], collections = [] } = payload;
  if (!opt.includeVariables || variables.length === 0) return "";

  const idToName = new Map<string, string>();
  for (const v of variables) if (v.id) idToName.set(v.id, v.name);

  const varById: VarById = new Map();
  for (const v of variables ?? []) if (v?.id) varById.set(v.id, v as any);

  const allowedSet = opt.selectedCollectionIds?.length ? new Set(opt.selectedCollectionIds) : null;

  const collById: Record<string, { id: string; name: string; modes: VariableMode[] }> = {};
  collections.forEach((c) => (collById[c.id] = c));

  const byCollection: Record<string, typeof variables> = {};
  for (const v of variables) {
    const key = v.variableCollectionId || "unknown";
    (byCollection[key] ||= []).push(v);
  }

  const onlyUnknowns = Object.keys(byCollection).length === 1 && byCollection["unknown"];
  const includeUnknowns = onlyUnknowns && !!allowedSet;

  const chunks: string[] = [];
  const defaultUnit = opt.numberUnit ?? "px";

  const labelSet = new Set(["thin","extralight","ultralight","light","regular","normal","medium","semibold","demibold","bold","extrabold","ultrabold","black","heavy"]);
  const isWeightVarName = (name: string) => {
    const last = (name.split(/[\/\\]/).pop() || name).toLowerCase();
    const key = normalizeWeightKey(last);
    return /font.*weight|weight.*font/i.test(name) || labelSet.has(key);
  };

  const maybeResolveForString = (val: any, resolvedType: string, modeId?: string) => {
    // When preferTokenRefs is enabled, keep alias references intact so
    // formatValue can emit var(--token-name) instead of the resolved literal.
    if (opt.preferTokenRefs) return val;
    const t = (resolvedType || "").toUpperCase();
    const isStringish = t === "STRING" || (!NUMBER_LIKE_TYPES.has(t) && t !== "COLOR");
    if (isStringish && isAlias(val)) {
      const terminal = resolveAliasChainToPrimitive(val, modeId, varById);
      if (!isAlias(terminal)) return terminal;
    }
    return val;
  };

  for (const [collectionId, varsOfColl] of Object.entries(byCollection)) {
    if (allowedSet && !allowedSet.has(collectionId) && !(collectionId === "unknown" && includeUnknowns)) continue;

    const coll = collById[collectionId];
    const modes = coll?.modes?.length ? coll.modes : variableModes;

    const section: string[] = [];

    if (!modes || modes.length <= 1) {
      const rootLines: string[] = [];
      // When a specific mode is provided (modes[0]), use its modeId to look up
      // the correct column from valuesByMode; otherwise fall back to the first
      // available entry.
      const targetModeId = modes?.[0]?.modeId;
      for (const v of varsOfColl) {
        let modeKey: string | undefined;
        let modeVal: any | undefined;
        if (targetModeId && typeof v.valuesByMode?.[targetModeId] !== "undefined") {
          modeKey = targetModeId;
          modeVal = v.valuesByMode[targetModeId];
        } else {
          for (const [k, val] of Object.entries(v.valuesByMode ?? {})) {
            if (typeof val !== "undefined") { modeKey = k; modeVal = val; break; }
          }
        }
        if (typeof modeVal === "undefined") continue;
        const cssVar = `--${toCssVarName(v.name)}`;
        const unit = v.resolvedType === "COLOR" || isWeightVarName(v.name) ? "none" : defaultUnit;
        const outVal = maybeResolveForString(modeVal, v.resolvedType, modeKey);
        rootLines.push(`  ${cssVar}: ${formatValue(outVal, v.resolvedType, unit, !!opt.preferTokenRefs, idToName)};`);
      }
      if (rootLines.length) section.push(`/* ${coll?.name ?? "Variables"} */`, `:root {`, ...rootLines, `}`, "");
    } else {
      let printed = false;
      for (const m of modes) {
        const modeLines: string[] = [];
        for (const v of varsOfColl) {
          const val = v.valuesByMode[m.modeId];
          if (typeof val === "undefined") continue;
          const cssVar = `--${toCssVarName(v.name)}`;
          const unit = v.resolvedType === "COLOR" || isWeightVarName(v.name) ? "none" : defaultUnit;
          const outVal = maybeResolveForString(val, v.resolvedType, m.modeId);
          modeLines.push(`  ${cssVar}: ${formatValue(outVal, v.resolvedType, unit, !!opt.preferTokenRefs, idToName)};`);
        }
        if (modeLines.length) {
          printed = true;
          section.push(section.length === 0 ? `/* ${coll?.name ?? "Variables"} */` : "", `[data-mode="${m.name}"] {`, ...modeLines, `}`, "");
        }
      }
      if (!printed) section.length = 0;
    }

    if (section.length) chunks.push(...section);
  }

  return chunks.join("\n");
}

/* -------- Text Styles  -------- */

function emitTextStylesSection(payload: Payload, opt: GenerateCSSOptions): string {
  if (!opt.includeTextStyles) return "";
  const { textStyles = [], variables = [] } = payload;
  if (!textStyles.length) return "";

  const idToName = new Map<string, string>();
  for (const v of variables ?? []) if (v.id) idToName.set(v.id, v.name);

  const preferRefs = !!opt.preferTokenRefs;
  const weightVars = buildWeightVarIndex(variables);

  const familyToVar = buildFamilyToVarMap(payload);

  if (familyToVar.size < 2) {
    const freq = new Map<string, number>();
    for (const s of textStyles) {
      const lit = quoteFontFamily(s.fontFamily) ?? quoteFontFamily(s.fontName?.family);
      const norm = normalizeFamilyName(lit);
      if (norm) freq.set(norm, (freq.get(norm) || 0) + 1);
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
    if (sorted[0] && !familyToVar.has(sorted[0])) familyToVar.set(sorted[0], "--font-family-primary");
    if (sorted[1] && !familyToVar.has(sorted[1])) familyToVar.set(sorted[1], "--font-family-secondary");
  }

  const blocks: string[] = [];

  for (const s of textStyles) {
    // Extract only the token part (after the slash) from the text style name
    // e.g., "Headline/headline-100-bold" -> "headline-100-bold"
    const fullName = s.name ?? "text-style";
    const tokenName = fullName.includes('/') ? fullName.split('/')[1] : fullName;
    const name = kebab(tokenName);
    const cls = `.${name}`;

    // boundVariables from Figma style bindings (properties bound to variables)
    const bv: Record<string, any> = s.boundVariables || {};

    // font-family: prefer boundVariable, then heuristic var match, then literal
    const literalFamily = quoteFontFamily(s.fontFamily) ?? quoteFontFamily(s.fontName?.family);
    const norm = normalizeFamilyName(literalFamily);

    let fontFamilyDecl: string | undefined;
    if (isAlias(bv.fontFamily)) {
      fontFamilyDecl = `  font-family: var(--${toCssVarName(idToName.get(bv.fontFamily.id) ?? bv.fontFamily.id)});`;
    } else if (norm && familyToVar.has(norm)) {
      fontFamilyDecl = `  font-family: var(${familyToVar.get(norm)});`;
    } else if (literalFamily) {
      fontFamilyDecl = `  font-family: ${literalFamily};`;
    }

    // font-weight: prefer boundVariable, then alias on value, then heuristic, then literal
    let weightLabel: string | undefined =
      typeof s.fontWeight === "string" ? s.fontWeight : (s.fontName?.style as string | undefined);

    let fontWeight: string | undefined;
    if (isAlias(bv.fontWeight)) {
      fontWeight = `var(--${toCssVarName(idToName.get(bv.fontWeight.id) ?? bv.fontWeight.id)})`;
    } else if (isAlias(s.fontWeight)) {
      fontWeight = `var(--${toCssVarName(idToName.get((s.fontWeight as any).id) ?? (s.fontWeight as any).id)})`;
    } else if (typeof weightLabel === "string") {
      const key = normalizeWeightKey(weightLabel);
      const tokenVar = weightVars.get(key);
      if (tokenVar) fontWeight = `var(${tokenVar})`;
      else {
        const n = weightNameToNumber(weightLabel);
        if (n) fontWeight = String(n);
      }
    } else if (typeof s.fontWeight === "number") {
      fontWeight = String(s.fontWeight);
    }

    // font-size: prefer boundVariable, then alias on value, then literal
    const fontSize = isAlias(bv.fontSize)
      ? `var(--${toCssVarName(idToName.get(bv.fontSize.id) ?? bv.fontSize.id)})`
      : isAlias(s.fontSize)
        ? `var(--${toCssVarName(idToName.get((s.fontSize as any).id) ?? (s.fontSize as any).id)})`
        : typeof s.fontSize === "number" ? `${to1Smart(s.fontSize)}px` : undefined;

    // line-height: prefer boundVariable, then alias on value, then literal
    const lineHeight = isAlias(bv.lineHeight)
      ? `var(--${toCssVarName(idToName.get(bv.lineHeight.id) ?? bv.lineHeight.id)})`
      : isAlias(s.lineHeight)
        ? `var(--${toCssVarName(idToName.get((s.lineHeight as any).id) ?? (s.lineHeight as any).id)})`
        : lineHeightToCss(s.lineHeight);

    // letter-spacing: prefer boundVariable, then alias on value, then literal
    const letterSpacing = isAlias(bv.letterSpacing)
      ? `var(--${toCssVarName(idToName.get(bv.letterSpacing.id) ?? bv.letterSpacing.id)})`
      : isAlias(s.letterSpacing)
        ? `var(--${toCssVarName(idToName.get((s.letterSpacing as any).id) ?? (s.letterSpacing as any).id)})`
        : letterSpacingToCss(s.letterSpacing);

    const textTransform = s.textCase ? String(s.textCase).toLowerCase() : undefined;
    const textDecoration = s.textDecoration ? String(s.textDecoration).toLowerCase() : undefined;

    const decls: string[] = [];
    if (fontFamilyDecl) decls.push(fontFamilyDecl);
    if (fontWeight) decls.push(`  font-weight: ${fontWeight};`);
    if (fontSize) decls.push(`  font-size: ${fontSize};`);
    if (lineHeight) decls.push(`  line-height: ${lineHeight};`);
    if (letterSpacing) decls.push(`  letter-spacing: ${letterSpacing};`);
    if (textTransform && textTransform !== "original") {
      const map: Record<string, string> = { upper: "uppercase", lowercase: "lowercase", title: "capitalize" };
      decls.push(`  text-transform: ${map[textTransform] ?? textTransform};`);
    }
    if (textDecoration && textDecoration !== "none") {
      decls.push(`  text-decoration: ${textDecoration};`);
    }

    if (decls.length) blocks.push(`${cls} {\n${decls.join("\n")}\n}\n`);
  }

  if (!blocks.length) return "";
  return ["/* Text Styles as classes (alias → var when possible; else literals) */", ...blocks].join("\n");
}

/* -------- Paints -------- */

function firstVisible(arr: any[] | undefined): any | undefined {
  if (!arr || arr.length === 0) return undefined;
  const found = arr.find((p: any) => p?.visible !== false);
  return found ?? arr[0];
}
function gradientToCss(stops: any[], idToName: Map<string,string>, preferTokenRefs: boolean): string {
  const parts = (stops ?? []).map(s => {
    // Check boundVariables first (Figma stores variable bindings here, not on .color directly)
    const bvColor = s.boundVariables?.color;
    const col = isAlias(bvColor)
      ? `var(--${toCssVarName(idToName.get(bvColor.id) ?? bvColor.id)})`
      : isAlias(s.color)
        ? `var(--${toCssVarName(idToName.get(s.color.id) ?? s.color.id)})`
        : rgbaFromColor(s.color);
    const pos = typeof s.position === "number" ? `${to1Smart(s.position * 100)}%` : undefined;
    return pos ? `${col} ${pos}` : col;
  });
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function emitPaintStylesSection(payload: Payload, opt: GenerateCSSOptions): string {
  if (!opt.includePaintStyles) return "";
  const { paintStyles = [], variables = [] } = payload;
  if (!paintStyles.length) return "";

  const idToName = new Map<string,string>();
  for (const v of variables ?? []) if (v.id) idToName.set(v.id, v.name);

  const lines: string[] = [];
  for (const p of paintStyles) {
    // Extract only the token part (after the slash) from the paint style name
    // e.g., "Gradient/gradient-primary-default-100" -> "gradient-primary-default-100"
    const fullName = p.name ?? "paint";
    const tokenName = fullName.includes('/') ? fullName.split('/')[1] : fullName;
    const name = kebab(tokenName);
    const paint = firstVisible(p.paints);
    if (!paint) continue;

    if (paint.type === "SOLID") {
      // Check boundVariables first (Figma stores variable bindings here)
      const pbv = paint.boundVariables || {};
      const colorVal = isAlias(pbv.color)
        ? `var(--${toCssVarName(idToName.get(pbv.color.id) ?? pbv.color.id)})`
        : isAlias(paint.color)
          ? `var(--${toCssVarName(idToName.get(paint.color.id) ?? paint.color.id)})`
          : rgbaFromColor(paint.color);
      lines.push(`  --${name}: ${colorVal};`);

      if (isAlias(pbv.opacity)) {
        lines.push(`  --${name}-opacity: var(--${toCssVarName(idToName.get(pbv.opacity.id) ?? pbv.opacity.id)});`);
      } else if (typeof paint.opacity === "number" && paint.opacity !== 1) {
        lines.push(`  --${name}-opacity: ${to1Smart(paint.opacity)};`);
      } else if (isAlias(paint.opacity)) {
        lines.push(`  --${name}-opacity: var(--${toCssVarName(idToName.get(paint.opacity.id) ?? paint.opacity.id)});`);
      }
    } else if (paint.type && paint.type.startsWith("GRADIENT")) {
      const grad = gradientToCss(paint.gradientStops ?? [], idToName, !!opt.preferTokenRefs);
      lines.push(`  --${name}: ${grad};`);
    }
  }

  if (!lines.length) return "";
  return ["/* Paint Styles (alias → var, else literals) */", ":root {", ...lines, "}", "",].join("\n");
}

/* -------- Effects -------- */

function emitEffectStylesSection(payload: Payload, opt: GenerateCSSOptions): string {
  if (!opt.includeEffectStyles) return "";
  const { effectStyles = [], variables = [] } = payload;
  if (!effectStyles.length) return "";

  const idToName = new Map<string,string>();
  for (const v of variables ?? []) if (v.id) idToName.set(v.id, v.name);

  const lines: string[] = [];

  for (const e of effectStyles) {
    // Extract only the token part (after the slash) from the effect style name
    // e.g., "Shadow/shadow-focus-100" -> "shadow-focus-100"
    const fullName = e.name ?? "effect";
    const tokenName = fullName.includes('/') ? fullName.split('/')[1] : fullName;
    const name = kebab(tokenName);
    const eff = firstVisible(e.effects);
    if (!eff) continue;

    if (eff.type === "DROP_SHADOW" || eff.type === "INNER_SHADOW") {
      // Check boundVariables first (Figma stores variable bindings here)
      const ebv = eff.boundVariables || {};
      const inset = eff.type === "INNER_SHADOW" ? " inset" : "";
      const ox = isAlias(ebv.offsetX)  ? `var(--${toCssVarName(idToName.get(ebv.offsetX.id) ?? ebv.offsetX.id)})` : isAlias(eff.offset?.x) ? `var(--${toCssVarName(idToName.get(eff.offset.x.id) ?? eff.offset.x.id)})` : `${to1Smart(eff.offset?.x ?? 0)}px`;
      const oy = isAlias(ebv.offsetY)  ? `var(--${toCssVarName(idToName.get(ebv.offsetY.id) ?? ebv.offsetY.id)})` : isAlias(eff.offset?.y) ? `var(--${toCssVarName(idToName.get(eff.offset.y.id) ?? eff.offset.y.id)})` : `${to1Smart(eff.offset?.y ?? 0)}px`;
      const blur = isAlias(ebv.radius) ? `var(--${toCssVarName(idToName.get(ebv.radius.id)  ?? ebv.radius.id)})`  : isAlias(eff.radius)   ? `var(--${toCssVarName(idToName.get(eff.radius.id)   ?? eff.radius.id)})`   : `${to1Smart(eff.radius ?? 0)}px`;
      const spread = isAlias(ebv.spread) ? `var(--${toCssVarName(idToName.get(ebv.spread.id) ?? ebv.spread.id)})` : isAlias(eff.spread) ? `var(--${toCssVarName(idToName.get(eff.spread.id)   ?? eff.spread.id)})`   : `${to1Smart(eff.spread ?? 0)}px`;
      const color = isAlias(ebv.color) ? `var(--${toCssVarName(idToName.get(ebv.color.id)   ?? ebv.color.id)})`   : isAlias(eff.color)   ? `var(--${toCssVarName(idToName.get(eff.color.id)    ?? eff.color.id)})`    : rgbaFromColor(eff.color ?? { r: 0, g: 0, b: 0, a: 0.25 });
      lines.push(`  --${name}: ${ox} ${oy} ${blur} ${spread} ${color}${inset};`);
    } else if (eff.type === "LAYER_BLUR") {
      const ebv = eff.boundVariables || {};
      const blur = isAlias(ebv.radius) ? `var(--${toCssVarName(idToName.get(ebv.radius.id) ?? ebv.radius.id)})` : isAlias(eff.radius) ? `var(--${toCssVarName(idToName.get(eff.radius.id) ?? eff.radius.id)})` : `${to1Smart(eff.radius ?? 0)}px`;
      lines.push(`  --${name}: ${blur};`);
    } else if (eff.type === "BACKGROUND_BLUR") {
      const ebv = eff.boundVariables || {};
      const blur = isAlias(ebv.radius) ? `var(--${toCssVarName(idToName.get(ebv.radius.id) ?? ebv.radius.id)})` : isAlias(eff.radius) ? `var(--${toCssVarName(idToName.get(eff.radius.id) ?? eff.radius.id)})` : `${to1Smart(eff.radius ?? 0)}px`;
      lines.push(`  --${name}: ${blur};`);
    }
  }

  if (!lines.length) return "";
  return ["/* Effect Styles (alias → var, else literals) */", ":root {", ...lines, "}", "",].join("\n");
}

/* ============================= public API ============================= */

function appendHeader(content: string): string {
  if (!content) return "";
  return `/* Auto-generated design tokens */\n/* ${new Date().toISOString()} */\n\n${content}`.replace(/\n{3,}/g, "\n\n");
}

export function generateCSS(payload: Payload, options: GenerateCSSOptions): GeneratedCSSFiles {
  const opt: GenerateCSSOptions = {
    includeTextStyles: true,
    includePaintStyles: true,
    includeEffectStyles: true,
    includeVariables: true,
    selectedCollectionIds: options.selectedCollectionIds,
    preferTokenRefs: options.preferTokenRefs ?? true,
    numberUnit: options.numberUnit ?? "px",
  };

  const result: GeneratedCSSFiles = {
    collections: {},
  };

  const { variables = [], collections = [], variableModes = [] } = payload;

  if (opt.includeVariables && collections.length > 0) {
    const allowedSet = opt.selectedCollectionIds?.length ? new Set(opt.selectedCollectionIds) : null;

    // Process each collection
    for (const coll of collections) {
      // Check if this collection is allowed based on selection
      if (allowedSet && !allowedSet.has(coll.id)) continue;

      const collName = coll.name;
      const collVariables = variables.filter((v) => v.variableCollectionId === coll.id);

      if (collVariables.length === 0) continue;

      // Check if collection has modes
      const modes = coll.modes && coll.modes.length > 1 ? coll.modes : null;

      if (modes) {
        // Create a file for each mode: <CollectionName>-<ModeName>.css
        for (const mode of modes) {
          // Use the full variable list so alias lookups can resolve names from other collections,
          // but restrict emitted output to this collection by setting selectedCollectionIds on a cloned options object
          const optForColl = { ...opt, selectedCollectionIds: [coll.id] };
          // Ensure the collection passed to the emitter only contains this single mode
          const collForMode = { ...coll, modes: [mode] };
          const modeContent = emitVariablesSection(
            { ...payload, collections: [collForMode], variableModes: [mode] },
            optForColl
          );

          if (modeContent) {
            const fileName = `${collName}-${mode.name}`;
            result.collections[fileName] = appendHeader(modeContent);
          }
        }
      } else {
        // Single mode or no modes: <CollectionName>.css
        const optForColl = { ...opt, selectedCollectionIds: [coll.id] };
        const collContent = emitVariablesSection(
          { ...payload, collections: [coll] },
          optForColl
        );

        if (collContent) {
          result.collections[collName] = appendHeader(collContent);
        }
      }
    }
  }

  // Handle styles (paint, effect, text styles) - all together in one Styles.css file
  const styleParts: string[] = [];

  if (opt.includePaintStyles) {
    const paintContent = emitPaintStylesSection(payload, opt);
    if (paintContent) styleParts.push(paintContent);
  }

  if (opt.includeEffectStyles) {
    const effectContent = emitEffectStylesSection(payload, opt);
    if (effectContent) styleParts.push(effectContent);
  }

  if (opt.includeTextStyles) {
    const textStyleContent = emitTextStylesSection(payload, opt);
    if (textStyleContent) styleParts.push(textStyleContent);
  }

  if (styleParts.length > 0) {
    const stylesContent = styleParts.join("\n\n");
    result.styles = appendHeader(stylesContent);
  }

  return result;
}

// Legacy function for backward compatibility
export function generateCSSLegacy(payload: Payload, options: GenerateCSSOptions): string {
  const files = generateCSS(payload, options);
  const parts: string[] = [];

  parts.push(`/* Auto-generated design tokens */`, `/* ${new Date().toISOString()} */`, "");

  // Add all collection files
  Object.values(files.collections).forEach((content) => {
    if (content) parts.push(content);
  });

  // Add styles file
  if (files.styles) {
    parts.push(files.styles);
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}
