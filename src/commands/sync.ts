import fs from "fs";
import path from "path";
import { Config, FileInfo, GraphReport, SymbolInfo } from "../types.js";
import { ROOT } from "../config.js";
import { openSession } from "../graph/driver.js";
import { walkRepo, buildFileInfo, ancestorFolders, normalizePath } from "../graph/walker.js";
import {
  addOrRefreshSourceFile, removeSourceFile, parseSourceFile,
  parseDocs, buildSymbolIndex, resolveCallsAccurate, resolveCallsFast,
} from "../graph/parser.js";
import {
  ensureSchema, ensureProjectRoot, writeFolders, writeFiles,
  writeSymbols, writeImports, writeCalls, writeDocs, writeDocLinks, writePlanItems,
  writeDecisions, writeConstraints, deleteFile, deleteSymbolsFor,
  deleteImportsFor, deleteCallsTouching, deleteDoc, gcEmptyFolders,
  collectCounts, diffCounts,
} from "../graph/writer.js";
import { unwrapRecord } from "../graph/driver.js";

export async function runSync(inputPaths: string[], cfg: Config, fast = false): Promise<GraphReport> {
  const norm = inputPaths
    .map((p) => path.isAbsolute(p) ? path.relative(ROOT, p) : p)
    .map(normalizePath)
    .filter(Boolean);

  const { isIgnored } = walkRepo(cfg);
  const ignoreSet = new Set(cfg.ignoreDirs);
  const filtered = norm.filter((p) => !isIgnored(p) && !ignoreSet.has(p.split("/")[0]));

  const changed: string[] = [];
  const removed: string[] = [];
  for (const p of filtered) {
    const full = path.join(ROOT, p);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) changed.push(p);
    else removed.push(p);
  }

  return applyBatch({ changed, removed }, cfg, fast);
}

export async function applyBatch(
  { changed, removed }: { changed: string[]; removed: string[] },
  cfg: Config,
  fast = false,
): Promise<GraphReport> {
  const t0 = Date.now();
  const session = openSession(cfg);
  const codeExts = new Set(cfg.codeExts);
  const docExts = new Set(cfg.docExts);

  try {
    await ensureSchema(session);
    await ensureProjectRoot(session, cfg.project, ROOT);
    const countsBefore = await collectCounts(session);

    const changedFiles: FileInfo[] = changed.map((p) => buildFileInfo(p, cfg));
    const codeChanged = changedFiles.filter((f) => codeExts.has(f.ext) && !f.isGenerated);
    const docChanged  = changedFiles.filter((f) => docExts.has(f.ext));

    const touchedCodePaths = new Set([
      ...codeChanged.map((f) => f.path),
      ...removed.filter((p) => codeExts.has(path.extname(p))),
    ]);

    // Find callers of touched symbols so we can recompute their CALLS edges.
    let expandedCallerFiles: string[] = [];
    if (touchedCodePaths.size) {
      const res = await session.run(
        `UNWIND $paths AS p
         MATCH (a:Symbol)-[:CALLS]->(b:Symbol)
         WHERE a.file = p OR b.file = p
         RETURN DISTINCT a.file AS f`,
        { paths: [...touchedCodePaths] },
      );
      expandedCallerFiles = res.records
        .map((r) => r.get("f") as string)
        .filter((f) => !touchedCodePaths.has(f));
    }

    // ── deletions ──────────────────────────────────────────────────────────
    for (const p of removed) {
      const ext = path.extname(p);
      if (codeExts.has(ext)) { await deleteFile(session, p); removeSourceFile(path.join(ROOT, p)); }
      else if (docExts.has(ext)) await deleteDoc(session, p);
      else await session.run(`MATCH (f:File {path:$p}) DETACH DELETE f`, { p });
    }
    for (const f of codeChanged) { await deleteSymbolsFor(session, f.path); await deleteImportsFor(session, f.path); }
    for (const f of docChanged)  await deleteDoc(session, f.path);
    await deleteCallsTouching(session, [...touchedCodePaths, ...expandedCallerFiles]);

    // ── insertions ─────────────────────────────────────────────────────────
    const affectedFolders = new Set<string>();
    for (const f of changedFiles) for (const a of ancestorFolders(f.path)) affectedFolders.add(a);
    await writeFolders(session, [...affectedFolders], cfg.project);
    await writeFiles(session, changedFiles);

    // Re-parse changed code files.
    const entries: { file: FileInfo; symbols: SymbolInfo[]; imports: ReturnType<typeof parseSourceFile>["imports"] }[] = [];
    for (const f of codeChanged) {
      const sf = addOrRefreshSourceFile(f.full);
      if (!sf) continue;
      const { symbols, imports } = parseSourceFile(sf, f.path);
      entries.push({ file: f, symbols, imports });
    }
    const newSymbols = entries.flatMap((e) => e.symbols);
    const newImports = entries.flatMap((e) => e.imports);
    await writeSymbols(session, newSymbols);
    await writeImports(session, newImports);

    // Recompute calls for touched + expanded caller files.
    const callerEntries: { file: FileInfo; symbols: SymbolInfo[] }[] = [];
    for (const p of expandedCallerFiles) {
      const full = path.join(ROOT, p);
      if (!fs.existsSync(full)) continue;
      const sf = addOrRefreshSourceFile(full);
      if (!sf) continue;
      const info = buildFileInfo(p, cfg);
      const { symbols } = parseSourceFile(sf, p);
      callerEntries.push({ file: info, symbols });
    }

    // Build symbol index: newly written + caller files + global DB state.
    const globalRows = await session.run(`MATCH (s:Symbol) RETURN s.file AS file, s.name AS name, s.startLine AS startLine`);
    const symbolIndex = buildSymbolIndex(
      globalRows.records.map((r) => {
        const row = unwrapRecord(r);
        return { file: row.file as string, name: row.name as string, startLine: row.startLine as number, kind: "function", endLine: 0, signature: "", isExported: false };
      }),
    );
    for (const s of [...newSymbols, ...callerEntries.flatMap((e) => e.symbols)]) {
      symbolIndex.set(`${s.file}::${s.name}::${s.startLine}`, s);
    }

    const resolveEntries = [
      ...entries.map((e) => ({ file: e.file, symbols: e.symbols, imports: e.imports })),
      ...callerEntries.map((e) => ({ file: e.file, symbols: e.symbols, imports: [] as ReturnType<typeof parseSourceFile>["imports"] })),
    ];
    const newCalls = fast
      ? resolveCallsFast(resolveEntries, symbolIndex)
      : resolveCallsAccurate(resolveEntries, symbolIndex);
    await writeCalls(session, newCalls);

    // Re-parse changed doc files.
    const allPathsRes = await session.run(`MATCH (f:File) RETURN f.path AS p`);
    const allPaths = allPathsRes.records.map((r) => r.get("p") as string);
    const { docs, planItems, decisions, constraints } = parseDocs(docChanged, allPaths, cfg);
    await writeDocs(session, docs);
    await writeDocLinks(session, docs);
    await writePlanItems(session, planItems);
    await writeDecisions(session, decisions);
    await writeConstraints(session, constraints);

    await gcEmptyFolders(session);

    const countsAfter = await collectCounts(session);
    const report: GraphReport = {
      mode: "sync",
      changed: changedFiles.map((f) => f.path),
      removed,
      total: countsAfter,
      delta: diffCounts(countsBefore, countsAfter),
      durationMs: Date.now() - t0,
    };
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await session.close();
  }
}
