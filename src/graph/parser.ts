import fs from "fs";
import path from "path";
import { Project, SyntaxKind, ts, Node, Scope, ClassDeclaration } from "ts-morph";
import {
  Config, FileInfo, SymbolInfo, ImportEdge, CallEdge, SymbolKey,
  SymbolEdge, ReExportsEdge, ImportTypeEdge,
  DocInfo, PlanItem, Decision, Constraint, ParsedDocs,
} from "../types.js";
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
  return { target: specifier, external: true };
}

// ── symbol-edge helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function declToKey(decl: any): SymbolKey | null {
  const sf = decl.getSourceFile();
  const file = normalizePath(path.relative(ROOT, sf.getFilePath()));
  const name = (decl.getNameNode?.()?.getText() as string | undefined) ?? (decl.getName?.() as string | undefined) ?? null;
  if (!name) return null;
  return { file, name, startLine: decl.getStartLineNumber() as number };
}

function dedupeSymbolEdges(edges: SymbolEdge[]): SymbolEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const k = `${e.from.file}|${e.from.name}|${e.from.startLine}→${e.to.file}|${e.to.name}|${e.to.startLine}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Resolve an expression node to a SymbolKey via the type checker */
function resolveExprToKey(expr: Node): SymbolKey | null {
  try {
    const sym = expr.getSymbol();
    if (!sym) return null;
    const decls = sym.getDeclarations?.() ?? [];
    if (!decls.length) return null;
    return declToKey(decls[0]);
  } catch {
    return null;
  }
}

/**
 * Extract type references from a type node — parameters, return types, property types.
 * NOT full body scan; restricted to signature/declaration types only.
 */
function extractTypeRefs(typeNode: Node | undefined): SymbolKey[] {
  if (!typeNode) return [];
  const refs: SymbolKey[] = [];
  try {
    for (const ref of typeNode.getDescendantsOfKind(SyntaxKind.TypeReference)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameNode = (ref as any).getTypeName?.();
        if (!nameNode) continue;
        const sym = nameNode.getSymbol?.();
        if (!sym) continue;
        const decls = sym.getDeclarations?.() ?? [];
        if (!decls.length) continue;
        const key = declToKey(decls[0]);
        if (key) refs.push(key);
      } catch { /* skip unresolvable */ }
    }
  } catch { /* skip */ }
  return refs;
}

/** Build clean signature from AST — handles multi-line declarations correctly */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSignature(name: string, node: any, modifiers: string[] = []): string {
  try {
    const tp = node.getTypeParameters?.()?.map((t: any) => t.getText()).join(", ") ?? "";
    const ps = node.getParameters?.()?.map((p: any) => {
      const n = p.getName?.() ?? "";
      const t = p.getTypeNode?.()?.getText() ?? null;
      const opt = p.isOptional?.() ? "?" : "";
      return t ? `${n}${opt}: ${t}` : n;
    }).join(", ") ?? "";
    const rt = node.getReturnTypeNode?.()?.getText() ?? "";
    const mod = modifiers.length ? modifiers.join(" ") + " " : "";
    return `${mod}${name}${tp ? `<${tp}>` : ""}(${ps})${rt ? `: ${rt}` : ""}`;
  } catch {
    return name;
  }
}

/** Collect parameter type strings for array-queryable storage */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function paramTypes(node: any): string[] | undefined {
  try {
    const types = node.getParameters?.()
      ?.map((p: any) => p.getTypeNode?.()?.getText() ?? null)
      .filter(Boolean) as string[];
    return types?.length ? types : undefined;
  } catch { return undefined; }
}

/** Walk base class chain for OVERRIDES — one level misses deep hierarchies */
function findMethodInChain(cls: ClassDeclaration, name: string, max = 8) {
  try {
    let cur = cls.getBaseClass();
    let depth = 0;
    while (cur && depth < max) {
      const m = cur.getMethod(name);
      if (m) return m;
      cur = cur.getBaseClass();
      depth++;
    }
  } catch { /* skip */ }
  return undefined;
}

// ── code parser ───────────────────────────────────────────────────────────────

export interface ParseSourceFileResult {
  symbols: SymbolInfo[];
  imports: ImportEdge[];
  importTypes: ImportTypeEdge[];
  extends: SymbolEdge[];
  implements: SymbolEdge[];
  overrides: SymbolEdge[];
  decoratedBy: SymbolEdge[];
  throws: SymbolEdge[];
  referencesType: SymbolEdge[];
  instantiates: SymbolEdge[];
  unionOf: SymbolEdge[];
  intersectionOf: SymbolEdge[];
  reExports: ReExportsEdge[];
}

export interface ParsedCode extends ParseSourceFileResult {
  file: FileInfo;
}

export function parseSourceFile(
  sf: ReturnType<typeof addOrRefreshSourceFile>,
  relPath: string,
): ParseSourceFileResult {
  if (!sf) return {
    symbols: [], imports: [], importTypes: [],
    extends: [], implements: [], overrides: [], decoratedBy: [],
    throws: [], referencesType: [], instantiates: [],
    unionOf: [], intersectionOf: [], reExports: [],
  };

  const symbols: SymbolInfo[] = [];
  const imports: ImportEdge[] = [];
  const importTypes: ImportTypeEdge[] = [];
  const extendsEdges: SymbolEdge[] = [];
  const implementsEdges: SymbolEdge[] = [];
  const overridesEdges: SymbolEdge[] = [];
  const decoratedByEdges: SymbolEdge[] = [];
  const throwsEdges: SymbolEdge[] = [];
  const referencesTypeEdges: SymbolEdge[] = [];
  const instantiatesEdges: SymbolEdge[] = [];
  const unionOfEdges: SymbolEdge[] = [];
  const intersectionOfEdges: SymbolEdge[] = [];
  const reExportsEdges: ReExportsEdge[] = [];

  // ── imports ───────────────────────────────────────────────────────────────

  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!spec) continue;
    if (imp.isTypeOnly()) importTypes.push({ from: relPath, to: spec });
    else imports.push({ from: relPath, to: spec });
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

  // ── re-exports ────────────────────────────────────────────────────────────

  for (const exp of sf.getExportDeclarations()) {
    if (!exp.hasModuleSpecifier()) continue;
    const named = exp.getNamedExports();
    if (named.length) {
      // named re-exports: export { Foo, Bar } from './module'
      for (const ne of named) {
        try {
          const sym = ne.getNameNode().getSymbol();
          if (!sym) continue;
          const aliasedSym = sym.getAliasedSymbol() ?? sym;
          const decls = aliasedSym.getDeclarations?.() ?? [];
          if (!decls.length) continue;
          const key = declToKey(decls[0]);
          if (key) reExportsEdges.push({ file: relPath, symbol: key });
        } catch { /* skip */ }
      }
    } else {
      // star re-exports: export * from './module' — get all symbols from target file
      try {
        const targetSf = exp.getModuleSpecifierSourceFile();
        if (!targetSf) continue;
        for (const [, decls] of targetSf.getExportedDeclarations()) {
          for (const decl of decls) {
            const key = declToKey(decl);
            if (key) reExportsEdges.push({ file: relPath, symbol: key });
          }
        }
      } catch { /* skip */ }
    }
  }

  // ── symbol push helper ────────────────────────────────────────────────────

  const mkSym = (
    name: string | undefined,
    kind: SymbolInfo["kind"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    isExported = false,
    extras: Partial<SymbolInfo> = {},
  ): void => {
    if (!name) return;
    symbols.push({
      name, kind, file: relPath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      // extras.signature overrides the default text-based extraction
      signature: extras.signature ?? oneLiner((node.getText() as string).split("\n")[0] ?? name),
      isExported,
      ...extras,
    });
  };

  // helpers to collect throws/instantiates from a body node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectThrows = (bodyNode: any, fromKey: SymbolKey) => {
    try {
      for (const stmt of bodyNode.getDescendantsOfKind(SyntaxKind.ThrowStatement)) {
        const expr = stmt.getExpression();
        let key: SymbolKey | null = null;
        // Type resolution first — handles re-throws (throw err) and any typed expression
        try {
          const typeSym = expr.getType().getSymbol();
          if (typeSym) {
            const decls = typeSym.getDeclarations?.() ?? [];
            if (decls.length) key = declToKey(decls[0]);
          }
        } catch { /* skip */ }
        // Fallback: explicit new expression constructor
        if (!key && Node.isNewExpression(expr)) key = resolveExprToKey(expr.getExpression());
        if (key) throwsEdges.push({ from: fromKey, to: key });
      }
    } catch { /* skip */ }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectInstantiates = (bodyNode: any, fromKey: SymbolKey) => {
    try {
      for (const newExpr of bodyNode.getDescendantsOfKind(SyntaxKind.NewExpression)) {
        const key = resolveExprToKey(newExpr.getExpression());
        if (key) instantiatesEdges.push({ from: fromKey, to: key });
      }
    } catch { /* skip */ }
  };

  // ── functions (all levels — top-level + nested declarations) ─────────────

  for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName();
    if (!name) continue;
    const params = fn.getParameters().map((p) => ({
      name: p.getName(),
      type: p.getTypeNode()?.getText() ?? null,
      optional: p.isOptional(),
      default: p.getInitializer()?.getText() ?? null,
    }));
    const mods = fn.isAsync() ? ["async"] : [];
    mkSym(name, "function", fn, fn.isExported(), {
      jsdoc: fn.getJsDocs()[0]?.getDescription()?.trim() || undefined,
      async: fn.isAsync() || undefined,
      returnType: fn.getReturnTypeNode()?.getText(),
      parameters: params.length ? JSON.stringify(params) : undefined,
      parameterTypes: paramTypes(fn),
      genericParams: fn.getTypeParameters().map((tp) => tp.getText()).join(", ") || undefined,
      signature: buildSignature(name, fn, mods),
    });
    const fromKey: SymbolKey = { file: relPath, name, startLine: fn.getStartLineNumber() };
    for (const ref of extractTypeRefs(fn.getReturnTypeNode())) referencesTypeEdges.push({ from: fromKey, to: ref });
    for (const p of fn.getParameters()) for (const ref of extractTypeRefs(p.getTypeNode())) referencesTypeEdges.push({ from: fromKey, to: ref });
    collectThrows(fn, fromKey);
    collectInstantiates(fn, fromKey);
  }

  // ── classes ───────────────────────────────────────────────────────────────

  for (const cls of sf.getClasses()) {
    const className = cls.getName();
    if (!className) continue;
    const classKey: SymbolKey = { file: relPath, name: className, startLine: cls.getStartLineNumber() };
    const decNames = cls.getDecorators().map((d) => d.getName()).filter(Boolean) as string[];

    mkSym(className, "class", cls, cls.isExported(), {
      jsdoc: cls.getJsDocs()[0]?.getDescription()?.trim() || undefined,
      abstract: cls.isAbstract() || undefined,
      genericParams: cls.getTypeParameters().map((tp) => tp.getText()).join(", ") || undefined,
      decoratorNames: decNames.length ? decNames : undefined,
    });

    // EXTENDS
    try {
      const ext = cls.getExtends();
      if (ext) {
        const key = resolveExprToKey(ext.getExpression());
        if (key) extendsEdges.push({ from: classKey, to: key });
      }
    } catch { /* skip */ }

    // IMPLEMENTS
    try {
      for (const impl of cls.getImplements()) {
        const key = resolveExprToKey(impl.getExpression());
        if (key) implementsEdges.push({ from: classKey, to: key });
      }
    } catch { /* skip */ }

    // DECORATED_BY
    for (const dec of cls.getDecorators()) {
      try {
        const key = resolveExprToKey(dec.getExpression());
        if (key) decoratedByEdges.push({ from: classKey, to: key });
      } catch { /* skip */ }
    }

    // Methods
    for (const m of cls.getMethods()) {
      const mName = m.getName();
      const mScope = m.getScope() ?? Scope.Public;
      const vis = mScope === Scope.Private ? "private" : mScope === Scope.Protected ? "protected" : undefined;
      const methodKey: SymbolKey = { file: relPath, name: mName, startLine: m.getStartLineNumber() };
      const mDecNames = m.getDecorators().map((d) => d.getName()).filter(Boolean) as string[];
      const mParams = m.getParameters().map((p) => ({
        name: p.getName(),
        type: p.getTypeNode()?.getText() ?? null,
        optional: p.isOptional(),
        default: p.getInitializer()?.getText() ?? null,
      }));

      const mMods = [
        ...(m.isAsync() ? ["async"] : []),
        ...(m.isStatic() ? ["static"] : []),
        ...(m.isAbstract() ? ["abstract"] : []),
        ...(vis ? [vis] : []),
      ];
      mkSym(mName, "method", m, false, {
        parentName: className,
        jsdoc: m.getJsDocs()[0]?.getDescription()?.trim() || undefined,
        async: m.isAsync() || undefined,
        abstract: m.isAbstract() || undefined,
        static: m.isStatic() || undefined,
        visibility: vis,
        returnType: m.getReturnTypeNode()?.getText(),
        parameters: mParams.length ? JSON.stringify(mParams) : undefined,
        parameterTypes: paramTypes(m),
        genericParams: m.getTypeParameters().map((tp) => tp.getText()).join(", ") || undefined,
        decoratorNames: mDecNames.length ? mDecNames : undefined,
        signature: buildSignature(mName, m, mMods),
      });

      // OVERRIDES — walk full chain, not just one level
      try {
        const baseMethod = findMethodInChain(cls, mName);
        if (baseMethod) {
          const toKey = declToKey(baseMethod);
          if (toKey) overridesEdges.push({ from: methodKey, to: toKey });
        }
      } catch { /* skip */ }

      // DECORATED_BY
      for (const dec of m.getDecorators()) {
        try {
          const key = resolveExprToKey(dec.getExpression());
          if (key) decoratedByEdges.push({ from: methodKey, to: key });
        } catch { /* skip */ }
      }

      // REFERENCES_TYPE: params + return (signature only)
      for (const ref of extractTypeRefs(m.getReturnTypeNode())) referencesTypeEdges.push({ from: methodKey, to: ref });
      for (const p of m.getParameters()) for (const ref of extractTypeRefs(p.getTypeNode())) referencesTypeEdges.push({ from: methodKey, to: ref });

      collectThrows(m, methodKey);
      collectInstantiates(m, methodKey);
    }

    // Properties
    for (const prop of cls.getProperties()) {
      const propName = prop.getName();
      const pScope = prop.getScope() ?? Scope.Public;
      const pVis = pScope === Scope.Private ? "private" : pScope === Scope.Protected ? "protected" : undefined;
      const propKey: SymbolKey = { file: relPath, name: propName, startLine: prop.getStartLineNumber() };

      mkSym(propName, "property", prop, false, {
        parentName: className,
        static: prop.isStatic() || undefined,
        visibility: pVis,
        returnType: prop.getTypeNode()?.getText(),
      });

      for (const ref of extractTypeRefs(prop.getTypeNode())) referencesTypeEdges.push({ from: propKey, to: ref });
    }
  }

  // ── interfaces ────────────────────────────────────────────────────────────

  for (const iface of sf.getInterfaces()) {
    const ifName = iface.getName();
    const ifKey: SymbolKey = { file: relPath, name: ifName, startLine: iface.getStartLineNumber() };

    mkSym(ifName, "interface", iface, iface.isExported(), {
      jsdoc: iface.getJsDocs()[0]?.getDescription()?.trim() || undefined,
      genericParams: iface.getTypeParameters().map((tp) => tp.getText()).join(", ") || undefined,
    });

    try {
      for (const base of iface.getExtends()) {
        const key = resolveExprToKey(base.getExpression());
        if (key) extendsEdges.push({ from: ifKey, to: key });
      }
    } catch { /* skip */ }
  }

  // ── type aliases ──────────────────────────────────────────────────────────

  for (const t of sf.getTypeAliases()) {
    const tName = t.getName();
    const tKey: SymbolKey = { file: relPath, name: tName, startLine: t.getStartLineNumber() };

    mkSym(tName, "type", t, t.isExported(), {
      jsdoc: t.getJsDocs()[0]?.getDescription()?.trim() || undefined,
      genericParams: t.getTypeParameters().map((tp) => tp.getText()).join(", ") || undefined,
    });

    try {
      const typeNode = t.getTypeNode();
      if (!typeNode) continue;
      if (Node.isUnionTypeNode(typeNode)) {
        for (const member of typeNode.getTypeNodes()) {
          if (Node.isTypeReference(member)) {
            const key = resolveExprToKey((member as unknown as Node));
            if (!key) {
              // fallback: resolve via getTypeName
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nameNode = (member as any).getTypeName?.();
                const sym = nameNode?.getSymbol?.();
                const decls = sym?.getDeclarations?.() ?? [];
                const k = decls[0] ? declToKey(decls[0]) : null;
                if (k) unionOfEdges.push({ from: tKey, to: k });
              } catch { /* skip */ }
            } else {
              unionOfEdges.push({ from: tKey, to: key });
            }
          }
        }
      } else if (Node.isIntersectionTypeNode(typeNode)) {
        for (const member of typeNode.getTypeNodes()) {
          if (Node.isTypeReference(member)) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nameNode = (member as any).getTypeName?.();
              const sym = nameNode?.getSymbol?.();
              const decls = sym?.getDeclarations?.() ?? [];
              const k = decls[0] ? declToKey(decls[0]) : null;
              if (k) intersectionOfEdges.push({ from: tKey, to: k });
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── enums ─────────────────────────────────────────────────────────────────

  for (const e of sf.getEnums()) mkSym(e.getName(), "enum", e, e.isExported());

  // ── variable statements ───────────────────────────────────────────────────

  for (const vs of sf.getVariableStatements()) {
    const isExp = vs.isExported();
    for (const d of vs.getDeclarations()) {
      const init = d.getInitializer();
      const isFn = init && (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression);
      const name = d.getName();
      if (isFn && init) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = init as any;
        const params = fn.getParameters?.()?.map((p: any) => ({
          name: p.getName?.() ?? "",
          type: p.getTypeNode?.()?.getText() ?? null,
          optional: p.isOptional?.() ?? false,
          default: p.getInitializer?.()?.getText() ?? null,
        })) ?? [];
        mkSym(name, "function", d, isExp, {
          async: fn.isAsync?.() || undefined,
          returnType: fn.getReturnTypeNode?.()?.getText(),
          parameters: params.length ? JSON.stringify(params) : undefined,
          parameterTypes: paramTypes(fn),
          signature: buildSignature(name, fn, fn.isAsync?.() ? ["async"] : []),
        });
        const fromKey: SymbolKey = { file: relPath, name, startLine: d.getStartLineNumber() };
        for (const ref of extractTypeRefs(fn.getReturnTypeNode?.())) referencesTypeEdges.push({ from: fromKey, to: ref });
        for (const p of fn.getParameters?.() ?? []) for (const ref of extractTypeRefs(p.getTypeNode?.())) referencesTypeEdges.push({ from: fromKey, to: ref });
        collectThrows(fn, fromKey);
        collectInstantiates(fn, fromKey);
      } else {
        mkSym(name, "const", d, isExp);
      }
    }
  }

  return {
    symbols,
    imports,
    importTypes,
    extends: dedupeSymbolEdges(extendsEdges),
    implements: dedupeSymbolEdges(implementsEdges),
    overrides: dedupeSymbolEdges(overridesEdges),
    decoratedBy: dedupeSymbolEdges(decoratedByEdges),
    throws: dedupeSymbolEdges(throwsEdges),
    referencesType: dedupeSymbolEdges(referencesTypeEdges),
    instantiates: dedupeSymbolEdges(instantiatesEdges),
    unionOf: dedupeSymbolEdges(unionOfEdges),
    intersectionOf: dedupeSymbolEdges(intersectionOfEdges),
    reExports: reExportsEdges,
  };
}

export function parseCodeFiles(fileInfos: FileInfo[]): ParsedCode[] {
  return fileInfos.flatMap((f) => {
    const sf = addOrRefreshSourceFile(f.full);
    if (!sf) return [];
    const result = parseSourceFile(sf, f.path);
    return [{ file: f, ...result }];
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

const PLANNED_PATH_RE = /(?:\/|\\|\.)(?:[a-z0-9_\-]+\.)+[a-z]{1,6}$/i;

function looksLikePath(target: string): boolean {
  return target.includes("/") || PLANNED_PATH_RE.test(target);
}

function buildDocSuffixIndex(docPaths: string[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const docPath of docPaths) {
    const stem = docPath.replace(/\.mdx?$/, "");
    // Generate all sub-path suffixes that contain at least one "/"
    const parts = docPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const suffix = parts.slice(i).join("/");
      const suffixStem = suffix.replace(/\.mdx?$/, "");
      if (!idx.has(suffix)) idx.set(suffix, docPath);
      if (!idx.has(suffixStem)) idx.set(suffixStem, docPath);
    }
    // Full path itself (with and without ext) — catches exact doc path refs
    if (!idx.has(docPath)) idx.set(docPath, docPath);
    if (!idx.has(stem)) idx.set(stem, docPath);
  }
  return idx;
}

function resolveWikiLink(
  target: string,
  docIdIndex: Map<string, string>,
  docNameIndex: Map<string, string>,
  docSuffixIndex: Map<string, string>,
  pathSet: Set<string>,
): { kind: "doc" | "code" | "planned"; path: string } | null {
  if (pathSet.has(target)) return { kind: "code", path: target };
  const docPath = docIdIndex.get(target);
  if (docPath) return { kind: "doc", path: docPath };
  // Auto-assume .md when target has no extension — e.g. [[relationships]] → relationships.md
  const withMd = /\.[a-z]{1,6}$/i.test(target) ? null : target + ".md";
  if (withMd && pathSet.has(withMd)) return { kind: "doc", path: withMd };
  // Match by filename stem or filename (handles [[relationships]] or [[relationships.md]])
  const byName = docNameIndex.get(target) ?? (withMd ? docNameIndex.get(withMd) : null);
  if (byName) return { kind: "doc", path: byName };
  // Obsidian-style partial path suffix match — [[tools/hono]] → docs/api/tools/hono.md
  // Only for targets with "/" to avoid re-checking bare stems already handled above
  if (target.includes("/")) {
    const bySuffix = docSuffixIndex.get(target) ?? (withMd ? docSuffixIndex.get(withMd) : null);
    if (bySuffix) return { kind: "doc", path: bySuffix };
  }
  if (looksLikePath(target)) return { kind: "planned", path: target };
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

const KNOWN_META_KEYS = new Set(["id", "type", "name", "status", "summary", "updated", "tags", "keywords"]);

export function parseDocs(docFiles: FileInfo[], allPaths: string[], cfg: Config, indexDocFiles?: FileInfo[]): ParsedDocs {
  const pathSet = new Set(allPaths);
  const bareRx = buildBarePathRx(cfg);
  const docs: DocInfo[] = [];
  const planItems: PlanItem[] = [];
  const decisions: Decision[] = [];
  const constraints: Constraint[] = [];

  const docIdIndex = new Map<string, string>();
  // Maps filename stem and filename (with ext) to full doc path for wiki-link resolution
  const docNameIndex = new Map<string, string>();
  const parsedFiles = new Map<string, { content: string; fields: Record<string, FrontmatterValue>; body: string }>();

  // Build indices from ALL doc files (indexDocFiles) so cross-file [[id]] links resolve
  // even when only a subset of docs changed (sync mode). Falls back to docFiles.
  const docsForIndex = indexDocFiles ?? docFiles;
  const docFilePaths = new Set(docFiles.map((f) => f.path));
  for (const f of docsForIndex) {
    let content: string;
    try { content = fs.readFileSync(f.full, "utf-8"); } catch { continue; }
    const { fields, body } = parseFrontmatter(content);
    // Only store parsed content for files that will be processed (docFiles)
    if (docFilePaths.has(f.path)) parsedFiles.set(f.path, { content, fields, body });
    const id = typeof fields.id === "string" && fields.id ? fields.id : undefined;
    if (id) docIdIndex.set(id, f.path);
    // Index by filename (e.g. "relationships.md") and stem (e.g. "relationships")
    const fname = path.basename(f.path);
    const stem = fname.replace(/\.mdx?$/, "");
    if (!docNameIndex.has(fname)) docNameIndex.set(fname, f.path);
    if (!docNameIndex.has(stem)) docNameIndex.set(stem, f.path);
  }
  // Obsidian-style partial path suffix index — [[tools/hono]] resolves to doc by path suffix
  const docSuffixIndex = buildDocSuffixIndex(docsForIndex.map((f) => f.path));

  for (const f of docFiles) {
    const parsed = parsedFiles.get(f.path);
    if (!parsed) continue;
    const { content, fields, body } = parsed;

    const title = extractTitle(body || content, f.name);
    const summary = (typeof fields.summary === "string" && fields.summary) || extractSummary(body || content);
    const scope = extractScope(f.path, cfg.docScopeParents);
    const targetPaths = extractTargetPaths(body || content, f.path, pathSet, bareRx);

    const allWikiTargets = [
      ...extractWikiTargets(body || content),
      ...collectFrontmatterLinkTargets(fields),
    ];
    const docLinks: string[] = [];
    const plannedPaths: string[] = [];
    for (const target of allWikiTargets) {
      const resolved = resolveWikiLink(target, docIdIndex, docNameIndex, docSuffixIndex, pathSet);
      if (!resolved) continue;
      if (resolved.kind === "doc") { if (!docLinks.includes(resolved.path)) docLinks.push(resolved.path); }
      else if (resolved.kind === "planned") { if (!plannedPaths.includes(resolved.path)) plannedPaths.push(resolved.path); }
      else { if (!targetPaths.includes(resolved.path)) targetPaths.push(resolved.path); }
    }

    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!KNOWN_META_KEYS.has(k)) meta[k] = v;
    }

    docs.push({
      path: f.path, title, summary, scope, targetPaths, plannedPaths, docLinks,
      id: typeof fields.id === "string" && fields.id ? fields.id : undefined,
      docType: typeof fields.type === "string" && fields.type ? fields.type : undefined,
      name: typeof fields.name === "string" && fields.name ? fields.name : undefined,
      status: typeof fields.status === "string" && fields.status ? fields.status : undefined,
      tags: Array.isArray(fields.tags) ? (fields.tags as string[]) : undefined,
      keywords: Array.isArray(fields.keywords) ? (fields.keywords as string[]) : undefined,
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
    for (const secBody of decSections) {
      for (const bullet of extractBullets(secBody)) {
        const [head, ...rest] = bullet.split(/\s+[—:-]\s+/);
        decisions.push({ doc: f.path, index: decIdx++, title: oneLiner(head, 180), reason: oneLiner(rest.join(" — "), 400), scope, targetPaths: extractPathRefs(bullet, pathSet, f.path, bareRx) });
      }
    }

    const conSections = pickSections(sections, [/^(\d+\.\s+)?constraints?$/i, /^(\d+\.\s+)?non-?goals?$/i, /^(\d+\.\s+)?rules?$/i]);
    let conIdx = 0;
    for (const secBody of conSections) {
      for (const bullet of extractBullets(secBody)) {
        constraints.push({ doc: f.path, index: conIdx++, text: oneLiner(bullet, 400), severity: detectSeverity(bullet), scope, targetPaths: extractPathRefs(bullet, pathSet, f.path, bareRx) });
      }
    }
  }

  return { docs, planItems, decisions, constraints };
}
