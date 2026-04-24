"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOrRefreshSourceFile = addOrRefreshSourceFile;
exports.removeSourceFile = removeSourceFile;
exports.warmTsProject = warmTsProject;
exports.resolveImport = resolveImport;
exports.parseSourceFile = parseSourceFile;
exports.parseCodeFiles = parseCodeFiles;
exports.buildSymbolIndex = buildSymbolIndex;
exports.resolveCallsAccurate = resolveCallsAccurate;
exports.resolveCallsFast = resolveCallsFast;
exports.parseDocs = parseDocs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const config_js_1 = require("../config.js");
const walker_js_1 = require("./walker.js");
// ── ts-morph project (singleton) ─────────────────────────────────────────────
let _tsProject = null;
function getTsProject() {
    if (!_tsProject) {
        _tsProject = new ts_morph_1.Project({
            skipAddingFilesFromTsConfig: true,
            useInMemoryFileSystem: false,
            compilerOptions: {
                allowJs: true,
                jsx: ts_morph_1.ts.JsxEmit.Preserve,
                target: ts_morph_1.ts.ScriptTarget.ESNext,
                noEmit: true,
                checkJs: false,
                resolveJsonModule: false,
                skipLibCheck: true,
            },
        });
    }
    return _tsProject;
}
function addOrRefreshSourceFile(fullPath) {
    const proj = getTsProject();
    let sf = proj.getSourceFile(fullPath);
    if (sf) {
        try {
            sf.refreshFromFileSystemSync();
        }
        catch { /* removed */ }
        if (!fs_1.default.existsSync(fullPath)) {
            proj.removeSourceFile(sf);
            return null;
        }
        return sf;
    }
    try {
        return proj.addSourceFileAtPath(fullPath);
    }
    catch {
        return null;
    }
}
function removeSourceFile(fullPath) {
    const proj = getTsProject();
    const sf = proj.getSourceFile(fullPath);
    if (sf)
        proj.removeSourceFile(sf);
}
function warmTsProject(files) {
    for (const f of files) {
        try {
            addOrRefreshSourceFile(f.full);
        }
        catch { /* skip */ }
    }
}
// ── helpers ───────────────────────────────────────────────────────────────────
function oneLiner(text, max = 200) {
    return text.replace(/\s+/g, " ").trim().slice(0, max);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enclosingSymbol(node) {
    let cur = node.getParent();
    while (cur) {
        const k = cur.getKind();
        if (k === ts_morph_1.SyntaxKind.FunctionDeclaration || k === ts_morph_1.SyntaxKind.MethodDeclaration ||
            k === ts_morph_1.SyntaxKind.ClassDeclaration || k === ts_morph_1.SyntaxKind.FunctionExpression ||
            k === ts_morph_1.SyntaxKind.ArrowFunction) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const named = cur.getNameNode?.();
            if (named)
                return { name: named.getText(), node: cur };
            const parent = cur.getParent();
            if (parent?.getKind() === ts_morph_1.SyntaxKind.VariableDeclaration) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return { name: parent.getName?.() ?? null, node: parent };
            }
            return null;
        }
        cur = cur.getParent();
    }
    return null;
}
// ── import resolution ─────────────────────────────────────────────────────────
const CANDIDATE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
function resolveImport(fromFile, specifier) {
    if (!specifier.startsWith("."))
        return { target: specifier, external: true };
    const base = path_1.default.normalize(path_1.default.join(path_1.default.dirname(fromFile), specifier));
    const exists = (p) => fs_1.default.existsSync(path_1.default.join(config_js_1.ROOT, p));
    if (path_1.default.extname(base) && exists(base))
        return { target: (0, walker_js_1.normalizePath)(base), external: false };
    for (const ext of CANDIDATE_EXTS) {
        if (exists(`${base}${ext}`))
            return { target: (0, walker_js_1.normalizePath)(`${base}${ext}`), external: false };
    }
    for (const ext of CANDIDATE_EXTS) {
        const idx = path_1.default.join(base, `index${ext}`);
        if (exists(idx))
            return { target: (0, walker_js_1.normalizePath)(idx), external: false };
    }
    return { target: (0, walker_js_1.normalizePath)(`${base}.ts`), external: false };
}
function parseSourceFile(sf, relPath) {
    if (!sf)
        return { symbols: [], imports: [] };
    const symbols = [];
    const imports = [];
    for (const imp of sf.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue();
        if (spec)
            imports.push({ from: relPath, to: spec });
    }
    for (const call of sf.getDescendantsOfKind(ts_morph_1.SyntaxKind.CallExpression)) {
        const callee = call.getExpression();
        if (callee.getKind() === ts_morph_1.SyntaxKind.Identifier && callee.getText() === "require") {
            const arg = call.getArguments()[0];
            if (arg?.getKind() === ts_morph_1.SyntaxKind.StringLiteral) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                imports.push({ from: relPath, to: arg.getLiteralValue() });
            }
        }
    }
    const push = (name, kind, node, isExported = false) => {
        if (!name)
            return;
        symbols.push({ name, kind, file: relPath, startLine: node.getStartLineNumber(), endLine: node.getEndLineNumber(), signature: oneLiner(node.getText().split("\n")[0] ?? name), isExported });
    };
    for (const fn of sf.getFunctions())
        push(fn.getName(), "function", fn, fn.isExported());
    for (const cls of sf.getClasses()) {
        push(cls.getName(), "class", cls, cls.isExported());
        for (const m of cls.getMethods())
            push(m.getName(), "method", m, false);
    }
    for (const iface of sf.getInterfaces())
        push(iface.getName(), "interface", iface, iface.isExported());
    for (const t of sf.getTypeAliases())
        push(t.getName(), "type", t, t.isExported());
    for (const e of sf.getEnums())
        push(e.getName(), "enum", e, e.isExported());
    for (const vs of sf.getVariableStatements()) {
        const isExp = vs.isExported();
        for (const d of vs.getDeclarations()) {
            const init = d.getInitializer();
            const isFn = init && (init.getKind() === ts_morph_1.SyntaxKind.ArrowFunction || init.getKind() === ts_morph_1.SyntaxKind.FunctionExpression);
            push(d.getName(), isFn ? "function" : "const", d, isExp);
        }
    }
    return { symbols, imports };
}
function parseCodeFiles(fileInfos) {
    return fileInfos.flatMap((f) => {
        const sf = addOrRefreshSourceFile(f.full);
        if (!sf)
            return [];
        const { symbols, imports } = parseSourceFile(sf, f.path);
        return [{ file: f, symbols, imports }];
    });
}
function buildSymbolIndex(symbols) {
    const idx = new Map();
    for (const s of symbols)
        idx.set(`${s.file}::${s.name}::${s.startLine}`, s);
    return idx;
}
function findByName(idx, file, name) {
    for (const s of idx.values())
        if (s.file === file && s.name === name)
            return s;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function declToKey(decl) {
    const sf = decl.getSourceFile();
    const file = (0, walker_js_1.normalizePath)(path_1.default.relative(config_js_1.ROOT, sf.getFilePath()));
    const name = decl.getNameNode?.()?.getText() ?? decl.getName?.() ?? null;
    if (!name)
        return null;
    return { file, name, startLine: decl.getStartLineNumber() };
}
function dedupeEdges(calls) {
    const seen = new Set();
    return calls.filter((c) => {
        const k = `${c.from.file}|${c.from.name}|${c.from.startLine}→${c.to.file}|${c.to.name}|${c.to.startLine}`;
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}
function resolveCallsAccurate(entries, idx) {
    const calls = [];
    const isTracked = (k) => idx.has(`${k.file}::${k.name}::${k.startLine}`);
    for (const { file } of entries) {
        const sf = addOrRefreshSourceFile(file.full);
        if (!sf)
            continue;
        for (const call of sf.getDescendantsOfKind(ts_morph_1.SyntaxKind.CallExpression)) {
            let sym = null;
            try {
                sym = call.getExpression().getSymbol();
            }
            catch { /* skip */ }
            if (!sym)
                continue;
            const decls = sym.getDeclarations?.() ?? [];
            if (!decls.length)
                continue;
            const defDecl = decls.find((d) => d.getKind() === ts_morph_1.SyntaxKind.FunctionDeclaration || d.getKind() === ts_morph_1.SyntaxKind.MethodDeclaration ||
                d.getKind() === ts_morph_1.SyntaxKind.ClassDeclaration || d.getKind() === ts_morph_1.SyntaxKind.VariableDeclaration) ?? decls[0];
            const toKey = declToKey(defDecl);
            if (!toKey || !isTracked(toKey))
                continue;
            const fromInfo = enclosingSymbol(call);
            if (!fromInfo?.name)
                continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let fromKey = { file: file.path, name: fromInfo.name, startLine: fromInfo.node.getStartLineNumber() };
            if (!isTracked(fromKey)) {
                const alt = findByName(idx, fromKey.file, fromKey.name);
                if (!alt)
                    continue;
                fromKey = { ...fromKey, startLine: alt.startLine };
            }
            if (fromKey.file === toKey.file && fromKey.name === toKey.name && fromKey.startLine === toKey.startLine)
                continue;
            calls.push({ from: fromKey, to: toKey });
        }
    }
    return dedupeEdges(calls);
}
function resolveCallsFast(entries, idx) {
    const byName = new Map();
    for (const s of idx.values()) {
        const arr = byName.get(s.name) ?? [];
        arr.push(s);
        byName.set(s.name, arr);
    }
    const calls = [];
    for (const { file } of entries) {
        const sf = addOrRefreshSourceFile(file.full);
        if (!sf)
            continue;
        for (const call of sf.getDescendantsOfKind(ts_morph_1.SyntaxKind.CallExpression)) {
            const expr = call.getExpression();
            let toName = null;
            if (expr.getKind() === ts_morph_1.SyntaxKind.Identifier)
                toName = expr.getText();
            else if (expr.getKind() === ts_morph_1.SyntaxKind.PropertyAccessExpression) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                toName = expr.getLastChildByKind(ts_morph_1.SyntaxKind.Identifier)?.getText() ?? null;
            }
            if (!toName)
                continue;
            const fromInfo = enclosingSymbol(call);
            if (!fromInfo?.name)
                continue;
            const fromAlt = findByName(idx, file.path, fromInfo.name);
            if (!fromAlt)
                continue;
            for (const c of byName.get(toName) ?? []) {
                if (c.file === file.path)
                    continue;
                calls.push({ from: { file: fromAlt.file, name: fromAlt.name, startLine: fromAlt.startLine }, to: { file: c.file, name: c.name, startLine: c.startLine } });
            }
        }
    }
    return dedupeEdges(calls);
}
function parseFrontmatter(content) {
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m)
        return { fields: {}, body: content };
    const fields = {};
    const raw = m[1];
    const body = m[2];
    let currentKey = null;
    let inArray = false;
    const arrayBuf = [];
    const flushArray = () => {
        if (currentKey && inArray)
            fields[currentKey] = arrayBuf.slice();
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
            }
            else if (val.startsWith("[") && val.endsWith("]")) {
                fields[currentKey] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
            }
            else {
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
function extractWikiTargets(text) {
    const targets = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const target = m[1].split("|")[0].trim();
        if (target)
            targets.push(target);
    }
    return targets;
}
function resolveWikiLink(target, docIdIndex, pathSet) {
    if (pathSet.has(target))
        return { kind: "code", path: target };
    const docPath = docIdIndex.get(target);
    if (docPath)
        return { kind: "doc", path: docPath };
    return null;
}
function collectFrontmatterLinkTargets(fields) {
    const targets = [];
    for (const val of Object.values(fields)) {
        if (typeof val === "string")
            targets.push(...extractWikiTargets(val));
        else if (Array.isArray(val)) {
            for (const v of val)
                if (typeof v === "string")
                    targets.push(...extractWikiTargets(v));
        }
    }
    return targets;
}
function extractTitle(content, fallback) {
    const m = content.match(/^#\s+(.+?)\s*$/m);
    return m ? oneLiner(m[1]) : fallback.replace(/\.mdx?$/, "");
}
function extractSummary(content) {
    const afterH1 = content.replace(/^#\s+.+?\n+/, "");
    const para = afterH1.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith("#"));
    return para ? oneLiner(para, 400) : "";
}
function extractScope(relPath, scopeParents) {
    const parts = relPath.split("/");
    for (const parent of scopeParents) {
        const idx = parts.indexOf(parent);
        if (idx >= 0 && parts[idx + 1])
            return parts[idx + 1];
    }
    return parts[parts.length - 2] ?? "root";
}
function resolveDocRef(ref, docPath, pathSet) {
    if (!ref || ref.startsWith("http") || ref.startsWith("#") || ref.startsWith("mailto:"))
        return null;
    const clean = ref.split("#")[0].split("?")[0];
    if (!clean)
        return null;
    const candidate = clean.startsWith("/")
        ? (0, walker_js_1.normalizePath)(clean.slice(1))
        : (0, walker_js_1.normalizePath)(path_1.default.normalize(path_1.default.join(path_1.default.dirname(docPath), clean)));
    return pathSet.has(candidate) ? candidate : null;
}
function buildBarePathRx(cfg) {
    if (cfg.barePathRegex)
        return new RegExp(cfg.barePathRegex, "g");
    const allExts = [...cfg.codeExts, ...cfg.docExts, ".json", ".yaml", ".yml", ".sql", ".tf", ".css", ".scss"]
        .map((e) => e.slice(1)).join("|");
    return new RegExp(`\\b([A-Za-z0-9_\\-]+(?:\\/[A-Za-z0-9_\\-.]+)+\\.(?:${allExts}))\\b`, "g");
}
function extractPathRefs(text, pathSet, docPath, bareRx) {
    const refs = new Set();
    const inline = /`([^`\s]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|ya?ml|sql|tf))`/g;
    let m;
    while ((m = inline.exec(text)) !== null) {
        const r = resolveDocRef(m[1], docPath, pathSet);
        if (r)
            refs.add(r);
    }
    const bare = new RegExp(bareRx.source, bareRx.flags);
    while ((m = bare.exec(text)) !== null) {
        if (pathSet.has(m[1]))
            refs.add(m[1]);
    }
    return [...refs];
}
function extractTargetPaths(content, docPath, pathSet, bareRx) {
    const refs = new Set();
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRe.exec(content)) !== null) {
        const r = resolveDocRef(m[1], docPath, pathSet);
        if (r)
            refs.add(r);
    }
    for (const r of extractPathRefs(content, pathSet, docPath, bareRx))
        refs.add(r);
    return [...refs];
}
function splitSections(content) {
    const lines = content.split(/\r?\n/);
    const sections = [];
    let cur = { heading: "", level: 0, body: [] };
    for (const line of lines) {
        const m = line.match(/^(#{1,6})\s+(.*)$/);
        if (m) {
            sections.push({ ...cur, body: cur.body.join("\n") });
            cur = { heading: m[2].trim(), level: m[1].length, body: [] };
        }
        else
            cur.body.push(line);
    }
    sections.push({ ...cur, body: cur.body.join("\n") });
    return sections;
}
function pickSections(sections, patterns) {
    return sections.filter((s) => patterns.some((rx) => rx.test(s.heading))).map((s) => s.body);
}
function extractBullets(body) {
    const out = [];
    let buffer = null;
    for (const raw of body.split(/\r?\n/)) {
        const m = raw.match(/^\s*[-*]\s+(.+)$/);
        const cont = raw.match(/^\s{2,}(\S.*)$/);
        if (m) {
            if (buffer)
                out.push(buffer.trim());
            buffer = m[1];
        }
        else if (cont && buffer !== null)
            buffer += " " + cont[1];
        else if (raw.trim() === "") {
            if (buffer) {
                out.push(buffer.trim());
                buffer = null;
            }
        }
    }
    if (buffer)
        out.push(buffer.trim());
    return out.filter(Boolean);
}
function detectSeverity(text) {
    const upper = text.slice(0, 20).toUpperCase();
    if (upper.includes("MUST"))
        return "must";
    if (upper.includes("SHOULD"))
        return "should";
    return "nice";
}
const KNOWN_META_KEYS = new Set(["id", "type", "name", "status", "summary", "updated", "tags", "keywords"]);
function parseDocs(docFiles, allPaths, cfg) {
    const pathSet = new Set(allPaths);
    const bareRx = buildBarePathRx(cfg);
    const docs = [];
    const planItems = [];
    const decisions = [];
    const constraints = [];
    // Pass 1: build id→path index from frontmatter
    const docIdIndex = new Map();
    const parsedFiles = new Map();
    for (const f of docFiles) {
        let content;
        try {
            content = fs_1.default.readFileSync(f.full, "utf-8");
        }
        catch {
            continue;
        }
        const { fields, body } = parseFrontmatter(content);
        parsedFiles.set(f.path, { content, fields, body });
        const id = typeof fields.id === "string" && fields.id ? fields.id : undefined;
        if (id)
            docIdIndex.set(id, f.path);
    }
    // Pass 2: parse each doc with resolved wiki links
    for (const f of docFiles) {
        const parsed = parsedFiles.get(f.path);
        if (!parsed)
            continue;
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
        const docLinks = [];
        for (const target of allWikiTargets) {
            const resolved = resolveWikiLink(target, docIdIndex, pathSet);
            if (!resolved)
                continue;
            if (resolved.kind === "doc") {
                if (!docLinks.includes(resolved.path))
                    docLinks.push(resolved.path);
            }
            else {
                if (!targetPaths.includes(resolved.path))
                    targetPaths.push(resolved.path);
            }
        }
        // split frontmatter into well-known fields vs meta
        const meta = {};
        for (const [k, v] of Object.entries(fields)) {
            if (!KNOWN_META_KEYS.has(k))
                meta[k] = v;
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
            tags: Array.isArray(fields.tags) ? fields.tags : undefined,
            keywords: Array.isArray(fields.keywords) ? fields.keywords : undefined,
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
