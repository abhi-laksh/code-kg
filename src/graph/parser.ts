import fs from "fs";
import path from "path";
import { Project, SyntaxKind, ts, Node } from "ts-morph";
import { Config, FileInfo, SymbolInfo, ImportEdge, CallEdge, SymbolKey, DocInfo, PlanItem, Decision, Constraint, ParsedDocs } from "../types.js";
import { ROOT } from "../config.js";
import { normalizePath } from "./walker.js";

// ── ts-morph project (singleton) ─────────────────────────────────────────────

let _tsProject: Project | null = null;

function getTsProject(): Project {
  if (!_tsProject) {
    _tsProject = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: false,
      compilerOptions: {
        allowJs: true,
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.ESNext,
        noEmit: true,
        checkJs: false,
        resolveJsonModule: false,
        skipLibCheck: true,
      },
    });
  }
  return _tsProject;
}

export function addOrRefreshSourceFile(fullPath: string) {
  const proj = getTsProject();
  let sf = proj.getSourceFile(fullPath);
  if (sf) {
    try { sf.refreshFromFileSystemSync(); } catch { /* removed */ }
    if (!fs.existsSync(fullPath)) { proj.removeSourceFile(sf); return null; }
    return sf;
  }
  try { return proj.addSourceFileAtPath(fullPath); } catch { return null; }
}

export function removeSourceFile(fullPath: string): void {
  const proj = getTsProject();
  const sf = proj.getSourceFile(fullPath);
  if (sf) proj.removeSourceFile(sf);
}

export function warmTsProject(files: FileInfo[]): void {
  for (const f of files) {
    try { addOrRefreshSourceFile(f.full); } catch { /* skip */ }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function oneLiner(text: string, max = 200): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enclosingSymbol(node: Node): { name: string | null; node: Node } | null {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    const k = cur.getKind();
    if (
      k === SyntaxKind.FunctionDeclaration || k === SyntaxKind.MethodDeclaration ||
      k === SyntaxKind.ClassDeclaration || k === SyntaxKind.FunctionExpression ||
      k === SyntaxKind.ArrowFunction
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const named = (cur as any).getNameNode?.() as Node | undefined;
      if (named) return { name: named.getText(), node: cur };
      const parent = cur.getParent();
      if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { name: (parent as any).getName?.() ?? null, node: parent };
      }
      return null;
    }
    cur = cur.getParent();
  }
  return null;
}

// ── import resolution ─────────────────────────────────────────────────────────

const CANDIDATE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export function resolveImport(fromFile: string, specifier: string): { target: string; external: boolean } {
  if (!specifier.startsWith(".")) return { target: specifier, external: true };
  const base = path.normalize(path.join(path.dirname(fromFile), specifier));
  const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
  if (path.extname(base) && exists(base)) return { target: normalizePath(base), external: false };
  for (const ext of CANDIDATE_EXTS) {
    if (exists(`${base}${ext}`)) return { target: normalizePath(`${base}${ext}`), external: false };
  }
  for (const ext of CANDIDATE_EXTS) {
    const idx = path.join(base, `index${ext}`);
    if (exists(idx)) return { target: normalizePath(idx), external: false };
  }
  return { target: normalizePath(`${base}.ts`), external: false };
}

// ── code parser ───────────────────────────────────────────────────────────────

export interface ParsedCode {
  file: FileInfo;
  symbols: SymbolInfo[];
  imports: ImportEdge[];
}

export function parseSourceFile(sf: ReturnType<typeof addOrRefreshSourceFile>, relPath: string): { symbols: SymbolInfo[]; imports: ImportEdge[] } {
  if (!sf) return { symbols: [], imports: [] };

  const symbols: SymbolInfo[] = [];
  const imports: ImportEdge[] = [];

  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec) imports.push({ from: relPath, to: spec });
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (callee.getKind() === SyntaxKind.Identifier && callee.getText() === "require") {
      const arg = call.getArguments()[0];
      if (arg?.getKind() === SyntaxKind.StringLiteral) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        imports.push({ from: relPath, to: (arg as any).getLiteralValue() as string });
      }
    }
  }

  const push = (name: string | undefined, kind: SymbolInfo["kind"], node: { getStartLineNumber(): number; getEndLineNumber(): number; getText(): string }, isExported = false) => {
    if (!name) return;
    symbols.push({ name, kind, file: relPath, startLine: node.getStartLineNumber(), endLine: node.getEndLineNumber(), signature: oneLiner(node.getText().split("\n")[0] ?? name), isExported });
  };

  for (const fn of sf.getFunctions()) push(fn.getName(), "function", fn, fn.isExported());
  for (const cls of sf.getClasses()) {
    push(cls.getName(), "class", cls, cls.isExported());
    for (const m of cls.getMethods()) push(m.getName(), "method", m, false);
  }
  for (const iface of sf.getInterfaces()) push(iface.getName(), "interface", iface, iface.isExported());
  for (const t of sf.getTypeAliases()) push(t.getName(), "type", t, t.isExported());
  for (const e of sf.getEnums()) push(e.getName(), "enum", e, e.isExported());
  for (const vs of sf.getVariableStatements()) {
    const isExp = vs.isExported();
    for (const d of vs.getDeclarations()) {
      const init = d.getInitializer();
      const isFn = init && (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression);
      push(d.getName(), isFn ? "function" : "const", d, isExp);
    }
  }

  return { symbols, imports };
}

export function parseCodeFiles(fileInfos: FileInfo[]): ParsedCode[] {
  return fileInfos.flatMap((f) => {
    const sf = addOrRefreshSourceFile(f.full);
    if (!sf) return [];
    const { symbols, imports } = parseSourceFile(sf, f.path);
    return [{ file: f, symbols, imports }];
  });
}

// ── call resolution ───────────────────────────────────────────────────────────

type SymbolIndex = Map<string, SymbolInfo>;

export function buildSymbolIndex(symbols: SymbolInfo[]): SymbolIndex {
  const idx: SymbolIndex = new Map();
  for (const s of symbols) idx.set(`${s.file}::${s.name}::${s.startLine}`, s);
  return idx;
}

function findByName(idx: SymbolIndex, file: string, name: string): SymbolInfo | undefined {
  for (const s of idx.values()) if (s.file === file && s.name === name) return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function declToKey(decl: any): SymbolKey | null {
  const sf = decl.getSourceFile();
  const file = normalizePath(path.relative(ROOT, sf.getFilePath()));
  const name = (decl.getNameNode?.()?.getText() as string | undefined) ?? (decl.getName?.() as string | undefined) ?? null;
  if (!name) return null;
  return { file, name, startLine: decl.getStartLineNumber() as number };
}

function dedupeEdges(calls: CallEdge[]): CallEdge[] {
  const seen = new Set<string>();
  return calls.filter((c) => {
    const k = `${c.from.file}|${c.from.name}|${c.from.startLine}→${c.to.file}|${c.to.name}|${c.to.startLine}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function resolveCallsAccurate(entries: ParsedCode[], idx: SymbolIndex): CallEdge[] {
  const calls: CallEdge[] = [];
  const isTracked = (k: SymbolKey) => idx.has(`${k.file}::${k.name}::${k.startLine}`);

  for (const { file } of entries) {
    const sf = addOrRefreshSourceFile(file.full);
    if (!sf) continue;
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      let sym = null;
      try { sym = call.getExpression().getSymbol(); } catch { /* skip */ }
      if (!sym) continue;
      const decls = sym.getDeclarations?.() ?? [];
      if (!decls.length) continue;

      const defDecl = decls.find((d) =>
        d.getKind() === SyntaxKind.FunctionDeclaration || d.getKind() === SyntaxKind.MethodDeclaration ||
        d.getKind() === SyntaxKind.ClassDeclaration || d.getKind() === SyntaxKind.VariableDeclaration
      ) ?? decls[0];

      const toKey = declToKey(defDecl);
      if (!toKey || !isTracked(toKey)) continue;

      const fromInfo = enclosingSymbol(call);
      if (!fromInfo?.name) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fromKey: SymbolKey = { file: file.path, name: fromInfo.name, startLine: (fromInfo.node as any).getStartLineNumber() as number };
      if (!isTracked(fromKey)) {
        const alt = findByName(idx, fromKey.file, fromKey.name);
        if (!alt) continue;
        fromKey = { ...fromKey, startLine: alt.startLine };
      }
      if (fromKey.file === toKey.file && fromKey.name === toKey.name && fromKey.startLine === toKey.startLine) continue;
      calls.push({ from: fromKey, to: toKey });
    }
  }
  return dedupeEdges(calls);
}

export function resolveCallsFast(entries: ParsedCode[], idx: SymbolIndex): CallEdge[] {
  const byName = new Map<string, SymbolInfo[]>();
  for (const s of idx.values()) {
    const arr = byName.get(s.name) ?? [];
    arr.push(s);
    byName.set(s.name, arr);
  }
  const calls: CallEdge[] = [];
  for (const { file } of entries) {
    const sf = addOrRefreshSourceFile(file.full);
    if (!sf) continue;
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      let toName: string | null = null;
      if (expr.getKind() === SyntaxKind.Identifier) toName = expr.getText();
      else if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toName = (expr as any).getLastChildByKind(SyntaxKind.Identifier)?.getText() as string ?? null;
      }
      if (!toName) continue;
      const fromInfo = enclosingSymbol(call);
      if (!fromInfo?.name) continue;
      const fromAlt = findByName(idx, file.path, fromInfo.name);
      if (!fromAlt) continue;
      for (const c of byName.get(toName) ?? []) {
        if (c.file === file.path) continue;
        calls.push({ from: { file: fromAlt.file, name: fromAlt.name, startLine: fromAlt.startLine }, to: { file: c.file, name: c.name, startLine: c.startLine } });
      }
    }
  }
  return dedupeEdges(calls);
}

// ── doc parser ────────────────────────────────────────────────────────────────

type FrontmatterValue = string | string[] | number | boolean | null;

function parseFrontmatter(content: string): { fields: Record<string, FrontmatterValue>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fields: {}, body: content };

  const fields: Record<string, FrontmatterValue> = {};
  const raw = m[1];
  const body = m[2];

  let currentKey: string | null = null;
  let inArray = false;
  const arrayBuf: string[] = [];

  const flushArray = () => {
    if (currentKey && inArray) fields[currentKey] = arrayBuf.slice();
    inArray = false;
    arrayBuf.length = 0;
  };

  for (const line of raw.split(/\r?\n/)) {
    const stripped = line.replace(/#.*$/, "").trimEnd();
    const kv = stripped.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)?$/);
    if (kv) {
      flushArray();
      currentKey = kv[1];
      const val = (kv[2] ?? "").trim();
      if (val === "" || val === "[]") {
        inArray = true;
      } else if (val.startsWith("[") && val.endsWith("]")) {
        fields[currentKey] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      } else {
        fields[currentKey] = val.replace(/^["']|["']$/g, "");
        inArray = false;
      }
      continue;
    }
    const item = stripped.match(/^\s*-\s+(.*)/);
    if (item && inArray) {
      arrayBuf.push(item[1].trim().replace(/^["']|["']$/g, ""));
    }
  }
  flushArray();

  return { fields, body };
}

function extractWikiTargets(text: string): string[] {
  const targets: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const target = m[1].split("|")[0].trim();
    if (target) targets.push(target);
  }
  return targets;
}

function resolveWikiLink(
  target: string,
  docIdIndex: Map<string, string>,
  pathSet: Set<string>,
): { kind: "doc" | "code"; path: string } | null {
  if (pathSet.has(target)) return { kind: "code", path: target };
  const docPath = docIdIndex.get(target);
  if (docPath) return { kind: "doc", path: docPath };
  return null;
}

function collectFrontmatterLinkTargets(fields: Record<string, FrontmatterValue>): string[] {
  const targets: string[] = [];
  for (const val of Object.values(fields)) {
    if (typeof val === "string") targets.push(...extractWikiTargets(val));
    else if (Array.isArray(val)) {
      for (const v of val) if (typeof v === "string") targets.push(...extractWikiTargets(v));
    }
  }
  return targets;
}

function extractTitle(content: string, fallback: string): string {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m ? oneLiner(m[1]) : fallback.replace(/\.mdx?$/, "");
}

function extractSummary(content: string): string {
  const afterH1 = content.replace(/^#\s+.+?\n+/, "");
  const para = afterH1.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith("#"));
  return para ? oneLiner(para, 400) : "";
}

function extractScope(relPath: string, scopeParents: string[]): string {
  const parts = relPath.split("/");
  for (const parent of scopeParents) {
    const idx = parts.indexOf(parent);
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  return parts[parts.length - 2] ?? "root";
}

function resolveDocRef(ref: string, docPath: string, pathSet: Set<string>): string | null {
  if (!ref || ref.startsWith("http") || ref.startsWith("#") || ref.startsWith("mailto:")) return null;
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean) return null;
  const candidate = clean.startsWith("/")
    ? normalizePath(clean.slice(1))
    : normalizePath(path.normalize(path.join(path.dirname(docPath), clean)));
  return pathSet.has(candidate) ? candidate : null;
}

function buildBarePathRx(cfg: Config): RegExp {
  if (cfg.barePathRegex) return new RegExp(cfg.barePathRegex, "g");
  const allExts = [...cfg.codeExts, ...cfg.docExts, ".json", ".yaml", ".yml", ".sql", ".tf", ".css", ".scss"]
    .map((e) => e.slice(1)).join("|");
  return new RegExp(`\\b([A-Za-z0-9_\\-]+(?:\\/[A-Za-z0-9_\\-.]+)+\\.(?:${allExts}))\\b`, "g");
}

function extractPathRefs(text: string, pathSet: Set<string>, docPath: string, bareRx: RegExp): string[] {
  const refs = new Set<string>();
  const inline = /`([^`\s]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|ya?ml|sql|tf))`/g;
  let m: RegExpExecArray | null;
  while ((m = inline.exec(text)) !== null) {
    const r = resolveDocRef(m[1], docPath, pathSet);
    if (r) refs.add(r);
  }
  const bare = new RegExp(bareRx.source, bareRx.flags);
  while ((m = bare.exec(text)) !== null) {
    if (pathSet.has(m[1])) refs.add(m[1]);
  }
  return [...refs];
}

function extractTargetPaths(content: string, docPath: string, pathSet: Set<string>, bareRx: RegExp): string[] {
  const refs = new Set<string>();
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(content)) !== null) {
    const r = resolveDocRef(m[1], docPath, pathSet);
    if (r) refs.add(r);
  }
  for (const r of extractPathRefs(content, pathSet, docPath, bareRx)) refs.add(r);
  return [...refs];
}

interface Section { heading: string; level: number; body: string }

function splitSections(content: string): Section[] {
  const lines = content.split(/\r?\n/);
  const sections: Section[] = [];
  let cur: { heading: string; level: number; body: string[] } = { heading: "", level: 0, body: [] };
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { sections.push({ ...cur, body: cur.body.join("\n") }); cur = { heading: m[2].trim(), level: m[1].length, body: [] }; }
    else cur.body.push(line);
  }
  sections.push({ ...cur, body: cur.body.join("\n") });
  return sections;
}

function pickSections(sections: Section[], patterns: RegExp[]): string[] {
  return sections.filter((s) => patterns.some((rx) => rx.test(s.heading))).map((s) => s.body);
}

function extractBullets(body: string): string[] {
  const out: string[] = [];
  let buffer: string | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^\s*[-*]\s+(.+)$/);
    const cont = raw.match(/^\s{2,}(\S.*)$/);
    if (m) { if (buffer) out.push(buffer.trim()); buffer = m[1]; }
    else if (cont && buffer !== null) buffer += " " + cont[1];
    else if (raw.trim() === "") { if (buffer) { out.push(buffer.trim()); buffer = null; } }
  }
  if (buffer) out.push(buffer.trim());
  return out.filter(Boolean);
}

function detectSeverity(text: string): Constraint["severity"] {
  const upper = text.slice(0, 20).toUpperCase();
  if (upper.includes("MUST")) return "must";
  if (upper.includes("SHOULD")) return "should";
  return "nice";
}

const KNOWN_META_KEYS = new Set(["id", "type", "name", "status", "summary", "updated", "tags"]);

export function parseDocs(docFiles: FileInfo[], allPaths: string[], cfg: Config): ParsedDocs {
  const pathSet = new Set(allPaths);
  const bareRx = buildBarePathRx(cfg);
  const docs: DocInfo[] = [];
  const planItems: PlanItem[] = [];
  const decisions: Decision[] = [];
  const constraints: Constraint[] = [];

  // Pass 1: build id→path index from frontmatter
  const docIdIndex = new Map<string, string>();
  const parsedFiles = new Map<string, { content: string; fields: Record<string, FrontmatterValue>; body: string }>();
  for (const f of docFiles) {
    let content: string;
    try { content = fs.readFileSync(f.full, "utf-8"); } catch { continue; }
    const { fields, body } = parseFrontmatter(content);
    parsedFiles.set(f.path, { content, fields, body });
    const id = typeof fields.id === "string" && fields.id ? fields.id : undefined;
    if (id) docIdIndex.set(id, f.path);
  }

  // Pass 2: parse each doc with resolved wiki links
  for (const f of docFiles) {
    const parsed = parsedFiles.get(f.path);
    if (!parsed) continue;
    const { content, fields, body } = parsed;

    const title = extractTitle(body || content, f.name);
    const summary = (typeof fields.summary === "string" && fields.summary) || extractSummary(body || content);
    const scope = extractScope(f.path, cfg.docScopeParents);
    const targetPaths = extractTargetPaths(body || content, f.path, pathSet, bareRx);

    // collect all [[targets]] from body + frontmatter values, resolve each
    const allWikiTargets = [
      ...extractWikiTargets(body || content),
      ...collectFrontmatterLinkTargets(fields),
    ];
    const docLinks: string[] = [];
    for (const target of allWikiTargets) {
      const resolved = resolveWikiLink(target, docIdIndex, pathSet);
      if (!resolved) continue;
      if (resolved.kind === "doc") { if (!docLinks.includes(resolved.path)) docLinks.push(resolved.path); }
      else { if (!targetPaths.includes(resolved.path)) targetPaths.push(resolved.path); }
    }

    // split frontmatter into well-known fields vs meta
    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!KNOWN_META_KEYS.has(k)) meta[k] = v;
    }

    docs.push({
      path: f.path,
      title,
      summary,
      scope,
      targetPaths,
      docLinks,
      id: typeof fields.id === "string" && fields.id ? fields.id : undefined,
      docType: typeof fields.type === "string" && fields.type ? fields.type : undefined,
      name: typeof fields.name === "string" && fields.name ? fields.name : undefined,
      status: typeof fields.status === "string" && fields.status ? fields.status : undefined,
      tags: Array.isArray(fields.tags) ? (fields.tags as string[]) : undefined,
      updated: typeof fields.updated === "string" && fields.updated ? fields.updated : undefined,
      meta: Object.keys(meta).length ? meta : undefined,
    });

    let planIdx = 0;
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s+(.+)$/);
      if (m) {
        planItems.push({
          doc: f.path, index: planIdx++,
          title: oneLiner(m[2].trim()),
          status: m[1].toLowerCase() === "x" ? "done" : "todo",
          scope,
          targetPaths: extractPathRefs(m[2].trim(), pathSet, f.path, bareRx),
        });
      }
    }

    const sections = splitSections(content);
    const decSections = pickSections(sections, [/^(\d+\.\s+)?decisions?$/i, /^(\d+\.\s+)?architecture decisions?$/i, /^(\d+\.\s+)?adr\b/i]);
    let decIdx = 0;
    for (const body of decSections) {
      for (const bullet of extractBullets(body)) {
        const [head, ...rest] = bullet.split(/\s+[—:-]\s+/);
        decisions.push({ doc: f.path, index: decIdx++, title: oneLiner(head, 180), reason: oneLiner(rest.join(" — "), 400), scope, targetPaths: extractPathRefs(bullet, pathSet, f.path, bareRx) });
      }
    }

    const conSections = pickSections(sections, [/^(\d+\.\s+)?constraints?$/i, /^(\d+\.\s+)?non-?goals?$/i, /^(\d+\.\s+)?rules?$/i]);
    let conIdx = 0;
    for (const body of conSections) {
      for (const bullet of extractBullets(body)) {
        constraints.push({ doc: f.path, index: conIdx++, text: oneLiner(bullet, 400), severity: detectSeverity(bullet), scope, targetPaths: extractPathRefs(bullet, pathSet, f.path, bareRx) });
      }
    }
  }

  return { docs, planItems, decisions, constraints };
}
