import fs from "fs";
import path from "path";
import type * as Watchman from "fb-watchman";
import { Config } from "../types.js";
import { ROOT } from "../config.js";
import { closeDriver } from "../graph/driver.js";
import { walkRepo, normalizePath } from "../graph/walker.js";
import { warmTsProject } from "../graph/parser.js";
import { applyBatch } from "./sync.js";

const CLOCK_FILE = path.join(ROOT, ".graph.clock");

export async function runWatch(cfg: Config, fast = false): Promise<void> {
  let WatchmanModule: typeof Watchman;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    WatchmanModule = require("fb-watchman") as typeof Watchman;
  } catch {
    console.error("[watch] fb-watchman not found — install it: npm install fb-watchman");
    process.exit(1);
  }

  const client = new WatchmanModule!.Client();
  const pending = new Map<string, { exists: boolean }>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let lastClock: string | null = null;

  try {
    if (fs.existsSync(CLOCK_FILE)) lastClock = fs.readFileSync(CLOCK_FILE, "utf-8").trim() || null;
  } catch { /* ignore */ }

  const { isIgnored } = walkRepo(cfg);
  const ignoreSet = new Set(cfg.ignoreDirs);

  async function flush() {
    flushTimer = null;
    if (!pending.size) return;
    const changed: string[] = [];
    const removed: string[] = [];
    for (const [p, info] of pending.entries()) {
      if (isIgnored(p) || cfg.ignoreDirs.some((seg) => p.split("/").includes(seg))) continue;
      (info.exists ? changed : removed).push(p);
    }
    pending.clear();
    if (!changed.length && !removed.length) return;
    try {
      await applyBatch({ changed, removed }, cfg, fast);
    } catch (e) {
      console.error("[watch] batch failed:", (e as Error).message);
    }
  }

  function schedule() {
    if (!flushTimer) flushTimer = setTimeout(flush, cfg.debounceMs);
  }

  async function shutdown() {
    console.log("\n[watch] shutting down…");
    if (flushTimer) { clearTimeout(flushTimer); await flush(); }
    try { client.end(); } catch { /* ignore */ }
    await closeDriver();
    process.exit(0);
  }

  client.on("error", (err: Error) => {
    const msg = String(err);
    if (msg.includes("ENOENT") || msg.includes("no such file")) {
      console.error("[watch] watchman daemon not reachable — install with: brew install watchman");
      process.exit(1);
    }
    console.error("[watchman]", err);
  });

  client.capabilityCheck({ optional: [], required: ["relative_root"] }, (err: Error | null) => {
    if (err) { console.error("[watch] capability check failed:", err.message); process.exit(1); }

    client.command(["watch-project", ROOT], (err2: Error | null, resp: { watch: string; relative_path?: string; warning?: string }) => {
      if (err2) { console.error(err2); process.exit(1); }
      const { watch, relative_path: relativePath, warning } = resp;
      if (warning) console.warn("[watchman]", warning);

      const suffixes = [...cfg.codeExts, ...cfg.docExts].map((e) => e.slice(1));
      const ignoreDirExprs = cfg.ignoreDirs.map((d) => ["not", ["dirname", d]]);
      const expression = [
        "allof", ["type", "f"],
        ["anyof", ...suffixes.map((s) => ["suffix", s])],
        ["not", ["match", "*.d.ts", "basename"]],
        ...ignoreDirExprs,
      ];

      const sub: Record<string, unknown> = { expression, fields: ["name", "exists", "type"] };
      if (relativePath) sub.relative_root = relativePath;
      if (lastClock) sub.since = lastClock;

      client.command(["subscribe", watch, "kg-sub", sub], (err3: Error | null) => {
        if (err3) { console.error(err3); process.exit(1); }
        console.log(`[watch] subscribed to ${watch}${relativePath ? "/" + relativePath : ""}`);
        console.log(`[watch] resume clock: ${lastClock ?? "(none — fresh)"}`);
      });
    });
  });

  client.on("subscription", (evt: { subscription: string; clock?: string; files?: { name: string; exists: boolean }[] }) => {
    if (evt.subscription !== "kg-sub") return;
    if (evt.clock) {
      lastClock = evt.clock;
      try { fs.writeFileSync(CLOCK_FILE, String(lastClock)); } catch { /* ignore */ }
    }
    for (const file of evt.files ?? []) {
      pending.set(normalizePath(file.name), { exists: !!file.exists });
    }
    schedule();
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[watch] warming ts-morph project…");
  const { files } = walkRepo(cfg);
  const codeExts = new Set(cfg.codeExts);
  warmTsProject(files.filter((f) => codeExts.has(f.ext) && !f.isGenerated));
  console.log(`[watch] loaded ${files.length} source files. Ready.`);
}
