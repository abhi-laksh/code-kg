"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWatch = runWatch;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_js_1 = require("../config.js");
const driver_js_1 = require("../graph/driver.js");
const walker_js_1 = require("../graph/walker.js");
const parser_js_1 = require("../graph/parser.js");
const sync_js_1 = require("./sync.js");
const CLOCK_FILE = path_1.default.join(config_js_1.ROOT, ".graph.clock");
async function runWatch(cfg, fast = false) {
    let WatchmanModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        WatchmanModule = require("fb-watchman");
    }
    catch {
        console.error("[watch] fb-watchman not found — install it: npm install fb-watchman");
        process.exit(1);
    }
    const client = new WatchmanModule.Client();
    const pending = new Map();
    let flushTimer = null;
    let lastClock = null;
    try {
        if (fs_1.default.existsSync(CLOCK_FILE))
            lastClock = fs_1.default.readFileSync(CLOCK_FILE, "utf-8").trim() || null;
    }
    catch { /* ignore */ }
    const { isIgnored } = (0, walker_js_1.walkRepo)(cfg);
    const ignoreSet = new Set(cfg.ignoreDirs);
    async function flush() {
        flushTimer = null;
        if (!pending.size)
            return;
        const changed = [];
        const removed = [];
        for (const [p, info] of pending.entries()) {
            if (isIgnored(p) || cfg.ignoreDirs.some((seg) => p.split("/").includes(seg)))
                continue;
            (info.exists ? changed : removed).push(p);
        }
        pending.clear();
        if (!changed.length && !removed.length)
            return;
        try {
            await (0, sync_js_1.applyBatch)({ changed, removed }, cfg, fast);
        }
        catch (e) {
            console.error("[watch] batch failed:", e.message);
        }
    }
    function schedule() {
        if (!flushTimer)
            flushTimer = setTimeout(flush, cfg.debounceMs);
    }
    async function shutdown() {
        console.log("\n[watch] shutting down…");
        if (flushTimer) {
            clearTimeout(flushTimer);
            await flush();
        }
        try {
            client.end();
        }
        catch { /* ignore */ }
        await (0, driver_js_1.closeDriver)();
        process.exit(0);
    }
    client.on("error", (err) => {
        const msg = String(err);
        if (msg.includes("ENOENT") || msg.includes("no such file")) {
            console.error("[watch] watchman daemon not reachable — install with: brew install watchman");
            process.exit(1);
        }
        console.error("[watchman]", err);
    });
    client.capabilityCheck({ optional: [], required: ["relative_root"] }, (err) => {
        if (err) {
            console.error("[watch] capability check failed:", err.message);
            process.exit(1);
        }
        client.command(["watch-project", config_js_1.ROOT], (err2, resp) => {
            if (err2) {
                console.error(err2);
                process.exit(1);
            }
            const { watch, relative_path: relativePath, warning } = resp;
            if (warning)
                console.warn("[watchman]", warning);
            const suffixes = [...cfg.codeExts, ...cfg.docExts].map((e) => e.slice(1));
            const ignoreDirExprs = cfg.ignoreDirs.map((d) => ["not", ["dirname", d]]);
            const expression = [
                "allof", ["type", "f"],
                ["anyof", ...suffixes.map((s) => ["suffix", s])],
                ["not", ["match", "*.d.ts", "basename"]],
                ...ignoreDirExprs,
            ];
            const sub = { expression, fields: ["name", "exists", "type"] };
            if (relativePath)
                sub.relative_root = relativePath;
            if (lastClock)
                sub.since = lastClock;
            client.command(["subscribe", watch, "kg-sub", sub], (err3) => {
                if (err3) {
                    console.error(err3);
                    process.exit(1);
                }
                console.log(`[watch] subscribed to ${watch}${relativePath ? "/" + relativePath : ""}`);
                console.log(`[watch] resume clock: ${lastClock ?? "(none — fresh)"}`);
            });
        });
    });
    client.on("subscription", (evt) => {
        if (evt.subscription !== "kg-sub")
            return;
        if (evt.clock) {
            lastClock = evt.clock;
            try {
                fs_1.default.writeFileSync(CLOCK_FILE, String(lastClock));
            }
            catch { /* ignore */ }
        }
        for (const file of evt.files ?? []) {
            pending.set((0, walker_js_1.normalizePath)(file.name), { exists: !!file.exists });
        }
        schedule();
    });
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.log("[watch] warming ts-morph project…");
    const { files } = (0, walker_js_1.walkRepo)(cfg);
    const codeExts = new Set(cfg.codeExts);
    (0, parser_js_1.warmTsProject)(files.filter((f) => codeExts.has(f.ext) && !f.isGenerated));
    console.log(`[watch] loaded ${files.length} source files. Ready.`);
}
