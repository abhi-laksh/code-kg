"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRebuild = runRebuild;
const config_js_1 = require("../config.js");
const driver_js_1 = require("../graph/driver.js");
const walker_js_1 = require("../graph/walker.js");
const parser_js_1 = require("../graph/parser.js");
const writer_js_1 = require("../graph/writer.js");
async function runRebuild(cfg, fast = false) {
    const t0 = Date.now();
    const session = (0, driver_js_1.openSession)(cfg);
    const codeExts = new Set(cfg.codeExts);
    const docExts = new Set(cfg.docExts);
    try {
        let countsBefore = null;
        try {
            countsBefore = await (0, writer_js_1.collectCounts)(session);
        }
        catch { /* fresh db */ }
        console.log("[rebuild] wiping graph…");
        await session.run(`MATCH (n) DETACH DELETE n`);
        await (0, writer_js_1.ensureSchema)(session);
        await (0, writer_js_1.ensureProjectRoot)(session, cfg.project, config_js_1.ROOT);
        console.log("[rebuild] walking filesystem…");
        const { folders, files } = (0, walker_js_1.walkRepo)(cfg);
        console.log("[rebuild] parsing code (ts-morph)…");
        const codeFiles = files.filter((f) => codeExts.has(f.ext) && !f.isGenerated);
        const entries = (0, parser_js_1.parseCodeFiles)(codeFiles);
        const allSymbols = entries.flatMap((e) => e.symbols);
        const allImports = entries.flatMap((e) => e.imports);
        const symbolIndex = (0, parser_js_1.buildSymbolIndex)(allSymbols);
        console.log(`[rebuild] resolving CALLS (${fast ? "fast" : "accurate"})…`);
        const calls = fast ? (0, parser_js_1.resolveCallsFast)(entries, symbolIndex) : (0, parser_js_1.resolveCallsAccurate)(entries, symbolIndex);
        console.log("[rebuild] parsing docs…");
        const docFiles = files.filter((f) => docExts.has(f.ext));
        const { docs, planItems, decisions, constraints } = (0, parser_js_1.parseDocs)(docFiles, files.map((f) => f.path), cfg);
        console.log("[rebuild] writing to Neo4j…");
        await (0, writer_js_1.writeFolders)(session, folders, cfg.project);
        await (0, writer_js_1.writeFiles)(session, files);
        await (0, writer_js_1.writeSymbols)(session, allSymbols);
        await (0, writer_js_1.writeImports)(session, allImports);
        await (0, writer_js_1.writeCalls)(session, calls);
        await (0, writer_js_1.writeDocs)(session, docs);
        await (0, writer_js_1.writeDocLinks)(session, docs);
        await (0, writer_js_1.writePlanItems)(session, planItems);
        await (0, writer_js_1.writeDecisions)(session, decisions);
        await (0, writer_js_1.writeConstraints)(session, constraints);
        const countsAfter = await (0, writer_js_1.collectCounts)(session);
        const report = {
            mode: "rebuild",
            total: countsAfter,
            delta: countsBefore ? (0, writer_js_1.diffCounts)(countsBefore, countsAfter) : null,
            durationMs: Date.now() - t0,
        };
        console.log(JSON.stringify(report, null, 2));
        return report;
    }
    finally {
        await session.close();
    }
}
