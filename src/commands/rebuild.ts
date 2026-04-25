import { Config, GraphReport } from "../types.js";
import { ROOT } from "../config.js";
import { openSession } from "../graph/driver.js";
import { walkRepo } from "../graph/walker.js";
import { parseCodeFiles, parseDocs, buildSymbolIndex, resolveCallsAccurate, resolveCallsFast } from "../graph/parser.js";
import {
  ensureSchema, ensureProjectRoot, writeFolders, writeFiles,
  writeSymbols, writeImports, writeCalls, writeDocs, writeDocLinks, writePlanItems,
  writeDecisions, writeConstraints, gcOrphanFiles, collectCounts, diffCounts,
} from "../graph/writer.js";

export async function runRebuild(cfg: Config, fast = false): Promise<GraphReport> {
  const t0 = Date.now();
  const session = openSession(cfg);
  const codeExts = new Set(cfg.codeExts);
  const docExts = new Set(cfg.docExts);

  try {
    let countsBefore = null;
    try { countsBefore = await collectCounts(session); } catch { /* fresh db */ }

    console.log("[rebuild] wiping graph…");
    await session.run(`MATCH (n) DETACH DELETE n`);
    await ensureSchema(session);
    await ensureProjectRoot(session, cfg.project, ROOT);

    console.log("[rebuild] walking filesystem…");
    const { folders, files } = walkRepo(cfg);

    console.log("[rebuild] parsing code (ts-morph)…");
    const codeFiles = files.filter((f) => codeExts.has(f.ext) && !f.isGenerated);
    const entries = parseCodeFiles(codeFiles);
    const allSymbols = entries.flatMap((e) => e.symbols);
    const allImports = entries.flatMap((e) => e.imports);
    const symbolIndex = buildSymbolIndex(allSymbols);

    console.log(`[rebuild] resolving CALLS (${fast ? "fast" : "accurate"})…`);
    const calls = fast ? resolveCallsFast(entries, symbolIndex) : resolveCallsAccurate(entries, symbolIndex);

    console.log("[rebuild] parsing docs…");
    const docFiles = files.filter((f) => docExts.has(f.ext));
    const { docs, planItems, decisions, constraints } = parseDocs(docFiles, files.map((f) => f.path), cfg);

    console.log("[rebuild] writing to Neo4j…");
    await writeFolders(session, folders, cfg.project);
    await writeFiles(session, files);
    await writeSymbols(session, allSymbols);
    await writeImports(session, allImports);
    await writeCalls(session, calls);
    await writeDocs(session, docs);
    await writeDocLinks(session, docs);
    await writePlanItems(session, planItems);
    await writeDecisions(session, decisions);
    await writeConstraints(session, constraints);
    await gcOrphanFiles(session);

    const countsAfter = await collectCounts(session);
    const report: GraphReport = {
      mode: "rebuild",
      total: countsAfter,
      delta: countsBefore ? diffCounts(countsBefore, countsAfter) : null,
      durationMs: Date.now() - t0,
    };
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await session.close();
  }
}
