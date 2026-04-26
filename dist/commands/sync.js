"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSync = runSync;
exports.applyBatch = applyBatch;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const config_js_1 = require("../config.js");
const driver_js_1 = require("../graph/driver.js");
const walker_js_1 = require("../graph/walker.js");
const parser_js_1 = require("../graph/parser.js");
const writer_js_1 = require("../graph/writer.js");
const driver_js_2 = require("../graph/driver.js");
async function pruneIgnoredFromGraph(session, cfg) {
    const { isIgnored } = (0, walker_js_1.walkRepo)(cfg);
    const ignoreSet = new Set(cfg.ignoreDirs);
    const isNowIgnored = (p) => isIgnored(p) || p.split("/").some((seg) => ignoreSet.has(seg));
    const fileRes = await session.run(`MATCH (f:File) RETURN f.path AS p`);
    const docRes = await session.run(`MATCH (d:Doc)  RETURN d.path AS p`);
    const toRemoveFiles = fileRes.records.map((r) => r.get("p")).filter(isNowIgnored);
    const toRemoveDocs = docRes.records.map((r) => r.get("p")).filter(isNowIgnored);
    for (const p of toRemoveFiles)
        await (0, writer_js_1.deleteFile)(session, p);
    for (const p of toRemoveDocs)
        await (0, writer_js_1.deleteDoc)(session, p);
    const total = toRemoveFiles.length + toRemoveDocs.length;
    if (total)
        console.log(`[sync] pruned ${total} newly-ignored node(s) from graph`);
}
function detectChangedPaths() {
    try {
        const modified = (0, child_process_1.execSync)("git diff --name-only HEAD", { cwd: config_js_1.ROOT, encoding: "utf8" })
            .split("\n").map((s) => s.trim()).filter(Boolean);
        const untracked = (0, child_process_1.execSync)("git ls-files --others --exclude-standard", { cwd: config_js_1.ROOT, encoding: "utf8" })
            .split("\n").map((s) => s.trim()).filter(Boolean);
        const deleted = (0, child_process_1.execSync)("git ls-files --deleted", { cwd: config_js_1.ROOT, encoding: "utf8" })
            .split("\n").map((s) => s.trim()).filter(Boolean);
        const all = [...new Set([...modified, ...untracked, ...deleted])];
        if (all.length)
            console.log(`[sync] auto-detected ${all.length} changed file(s) from git`);
        return all;
    }
    catch {
        return [];
    }
}
async function runSync(inputPaths, cfg, fast = false) {
    if (!inputPaths.length) {
        const detected = detectChangedPaths();
        if (!detected.length) {
            console.log("[sync] no changed files detected — nothing to sync");
            return null;
        }
        inputPaths = detected;
    }
    const norm = inputPaths
        .map((p) => path_1.default.isAbsolute(p) ? path_1.default.relative(config_js_1.ROOT, p) : p)
        .map(walker_js_1.normalizePath)
        .filter(Boolean);
    const { isIgnored } = (0, walker_js_1.walkRepo)(cfg);
    const ignoreSet = new Set(cfg.ignoreDirs);
    const filtered = norm.filter((p) => !isIgnored(p) && !ignoreSet.has(p.split("/")[0]));
    const changed = [];
    const removed = [];
    for (const p of filtered) {
        const full = path_1.default.join(config_js_1.ROOT, p);
        if (fs_1.default.existsSync(full) && fs_1.default.statSync(full).isFile())
            changed.push(p);
        else
            removed.push(p);
    }
    const session = (0, driver_js_1.openSession)(cfg);
    try {
        await (0, writer_js_1.ensureSchema)(session);
        await pruneIgnoredFromGraph(session, cfg);
    }
    finally {
        await session.close();
    }
    return applyBatch({ changed, removed }, cfg, fast);
}
async function applyBatch({ changed, removed }, cfg, fast = false) {
    const t0 = Date.now();
    const session = (0, driver_js_1.openSession)(cfg);
    const codeExts = new Set(cfg.codeExts);
    const docExts = new Set(cfg.docExts);
    try {
        await (0, writer_js_1.ensureSchema)(session);
        await (0, writer_js_1.ensureProjectRoot)(session, cfg.project, config_js_1.ROOT);
        const countsBefore = await (0, writer_js_1.collectCounts)(session);
        const changedFiles = changed.map((p) => (0, walker_js_1.buildFileInfo)(p, cfg));
        const codeChanged = changedFiles.filter((f) => codeExts.has(f.ext) && !f.isGenerated);
        const docChanged = changedFiles.filter((f) => docExts.has(f.ext));
        const touchedCodePaths = new Set([
            ...codeChanged.map((f) => f.path),
            ...removed.filter((p) => codeExts.has(path_1.default.extname(p))),
        ]);
        // Find callers of touched symbols so we can recompute their CALLS edges.
        let expandedCallerFiles = [];
        if (touchedCodePaths.size) {
            const res = await session.run(`UNWIND $paths AS p
         MATCH (a:Symbol)-[:CALLS]->(b:Symbol)
         WHERE a.file = p OR b.file = p
         RETURN DISTINCT a.file AS f`, { paths: [...touchedCodePaths] });
            expandedCallerFiles = res.records
                .map((r) => r.get("f"))
                .filter((f) => !touchedCodePaths.has(f));
        }
        // ── deletions ──────────────────────────────────────────────────────────
        for (const p of removed) {
            const ext = path_1.default.extname(p);
            if (codeExts.has(ext)) {
                await (0, writer_js_1.deleteFile)(session, p);
                (0, parser_js_1.removeSourceFile)(path_1.default.join(config_js_1.ROOT, p));
            }
            else if (docExts.has(ext))
                await (0, writer_js_1.deleteDoc)(session, p);
            else
                await session.run(`MATCH (f:File {path:$p}) DETACH DELETE f`, { p });
        }
        for (const f of codeChanged) {
            await (0, writer_js_1.deleteSymbolsFor)(session, f.path);
            await (0, writer_js_1.deleteImportsFor)(session, f.path);
        }
        for (const f of docChanged)
            await (0, writer_js_1.deleteDoc)(session, f.path);
        await (0, writer_js_1.deleteCallsTouching)(session, [...touchedCodePaths, ...expandedCallerFiles]);
        // ── insertions ─────────────────────────────────────────────────────────
        const affectedFolders = new Set();
        for (const f of changedFiles)
            for (const a of (0, walker_js_1.ancestorFolders)(f.path))
                affectedFolders.add(a);
        await (0, writer_js_1.writeFolders)(session, [...affectedFolders], cfg.project);
        await (0, writer_js_1.writeFiles)(session, changedFiles);
        // Re-parse changed code files.
        const entries = [];
        for (const f of codeChanged) {
            const sf = (0, parser_js_1.addOrRefreshSourceFile)(f.full);
            if (!sf)
                continue;
            const result = (0, parser_js_1.parseSourceFile)(sf, f.path);
            entries.push({ file: f, ...result });
        }
        const newSymbols = entries.flatMap((e) => e.symbols);
        await (0, writer_js_1.writeSymbols)(session, newSymbols);
        await (0, writer_js_1.writeImports)(session, entries.flatMap((e) => e.imports));
        await (0, writer_js_1.writeImportTypes)(session, entries.flatMap((e) => e.importTypes));
        await (0, writer_js_1.writeExtends)(session, entries.flatMap((e) => e.extends));
        await (0, writer_js_1.writeImplements)(session, entries.flatMap((e) => e.implements));
        await (0, writer_js_1.writeOverrides)(session, entries.flatMap((e) => e.overrides));
        await (0, writer_js_1.writeDecoratedBy)(session, entries.flatMap((e) => e.decoratedBy));
        await (0, writer_js_1.writeThrows)(session, entries.flatMap((e) => e.throws));
        await (0, writer_js_1.writeReferencesType)(session, entries.flatMap((e) => e.referencesType));
        await (0, writer_js_1.writeInstantiates)(session, entries.flatMap((e) => e.instantiates));
        await (0, writer_js_1.writeUnionOf)(session, entries.flatMap((e) => e.unionOf));
        await (0, writer_js_1.writeIntersectionOf)(session, entries.flatMap((e) => e.intersectionOf));
        await (0, writer_js_1.writeReExports)(session, entries.flatMap((e) => e.reExports));
        // Recompute calls for touched + expanded caller files.
        const callerEntries = [];
        for (const p of expandedCallerFiles) {
            const full = path_1.default.join(config_js_1.ROOT, p);
            if (!fs_1.default.existsSync(full))
                continue;
            const sf = (0, parser_js_1.addOrRefreshSourceFile)(full);
            if (!sf)
                continue;
            const info = (0, walker_js_1.buildFileInfo)(p, cfg);
            const result = (0, parser_js_1.parseSourceFile)(sf, p);
            callerEntries.push({ file: info, ...result });
        }
        // Build symbol index: newly written + caller files + global DB state.
        const globalRows = await session.run(`MATCH (s:Symbol) RETURN s.file AS file, s.name AS name, s.startLine AS startLine`);
        const symbolIndex = (0, parser_js_1.buildSymbolIndex)(globalRows.records.map((r) => {
            const row = (0, driver_js_2.unwrapRecord)(r);
            return { file: row.file, name: row.name, startLine: row.startLine, kind: "function", endLine: 0, signature: "", isExported: false };
        }));
        for (const s of [...newSymbols, ...callerEntries.flatMap((e) => e.symbols)]) {
            symbolIndex.set(`${s.file}::${s.name}::${s.startLine}`, s);
        }
        const resolveEntries = [
            ...entries,
            ...callerEntries.map((e) => ({ ...e, imports: [] })),
        ];
        const newCalls = fast
            ? (0, parser_js_1.resolveCallsFast)(resolveEntries, symbolIndex)
            : (0, parser_js_1.resolveCallsAccurate)(resolveEntries, symbolIndex);
        await (0, writer_js_1.writeCalls)(session, newCalls);
        // Re-parse changed doc files.
        const allPathsRes = await session.run(`MATCH (f:File) RETURN f.path AS p`);
        const allPaths = allPathsRes.records.map((r) => r.get("p"));
        const { docs, planItems, decisions, constraints } = (0, parser_js_1.parseDocs)(docChanged, allPaths, cfg);
        await (0, writer_js_1.writeDocs)(session, docs);
        await (0, writer_js_1.writeDocLinks)(session, docs);
        await (0, writer_js_1.writePlanItems)(session, planItems);
        await (0, writer_js_1.writeDecisions)(session, decisions);
        await (0, writer_js_1.writeConstraints)(session, constraints);
        await (0, writer_js_1.gcEmptyFolders)(session);
        await (0, writer_js_1.gcOrphanFiles)(session);
        const countsAfter = await (0, writer_js_1.collectCounts)(session);
        const report = {
            mode: "sync",
            changed: changedFiles.map((f) => f.path),
            removed,
            total: countsAfter,
            delta: (0, writer_js_1.diffCounts)(countsBefore, countsAfter),
            durationMs: Date.now() - t0,
        };
        console.log(JSON.stringify(report, null, 2));
        return report;
    }
    finally {
        await session.close();
    }
}
