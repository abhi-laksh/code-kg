#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { closeDriver } from "./graph/driver.js";
import { runInit } from "./commands/init.js";
import { runInitTemplates } from "./commands/init-templates.js";
import { runRebuild } from "./commands/rebuild.js";
import { runSync } from "./commands/sync.js";
import { runWatch } from "./commands/watch.js";
import { runPing } from "./commands/ping.js";
import { runNew } from "./commands/new.js";
import { runReview } from "./commands/review.js";

const program = new Command();

program
  .name("code-kg")
  .description("Neo4j knowledge graph sync for TypeScript projects")
  .version("0.1.0");

// ── init ───────────────────────────────────────────────────────────────────────
program
  .command("init [projectName]")
  .description("configure .graphrc.json with Neo4j credentials and verify the connection")
  .action(async (projectName?: string) => {
    await runInit(projectName);
  });

// ── init-templates ────────────────────────────────────────────────────────────
program
  .command("init-templates")
  .description("scaffold brain-template knowledge base docs structure in the current project")
  .action(async () => {
    await runInitTemplates();
  });

// ── ping ──────────────────────────────────────────────────────────────────────
program
  .command("ping")
  .description("verify Neo4j connection and show db stats")
  .action(async () => {
    const cfg = loadConfig();
    await runPing(cfg);
  });

// ── rebuild ───────────────────────────────────────────────────────────────────
program
  .command("rebuild")
  .description("wipe the graph and re-index the entire project from scratch")
  .option("--fast", "use fast name-based call resolution instead of accurate type-following")
  .action(async (opts: { fast?: boolean }) => {
    const cfg = loadConfig();
    try {
      await runRebuild(cfg, !!opts.fast);
    } finally {
      await closeDriver();
    }
  });

// ── sync ──────────────────────────────────────────────────────────────────────
program
  .command("sync [paths...]")
  .description("incrementally update the graph for the given file paths (omit to auto-detect via git)")
  .option("--fast", "use fast name-based call resolution")
  .action(async (paths: string[], opts: { fast?: boolean }) => {
    const cfg = loadConfig();
    try {
      await runSync(paths ?? [], cfg, !!opts.fast);
    } finally {
      await closeDriver();
    }
  });

// ── watch ─────────────────────────────────────────────────────────────────────
program
  .command("watch")
  .description("watch for file changes via watchman and keep the graph in sync")
  .option("--fast", "use fast name-based call resolution")
  .action(async (opts: { fast?: boolean }) => {
    const cfg = loadConfig();
    await runWatch(cfg, !!opts.fast);
    // stays alive — watch manages its own process lifecycle
  });

// ── new ───────────────────────────────────────────────────────────────────────
program
  .command("new <type> <path>")
  .description(
    "create a new knowledge-base doc from a template\n" +
    "  types: feature, subfeature\n" +
    "         task, subtask, migration, refactor\n" +
    "         code, function, component, hook, service, module, api, schema\n" +
    "         test, app, architecture, tool"
  )
  .action((type: string, destPath: string) => {
    runNew(type, destPath);
  });

// ── add-guidelines ───────────────────────────────────────────────────────────
program
  .command("add-guidelines [dest]")
  .description("copy QUERY_GUIDELINES.md into the project (default: QUERY_GUIDELINES.md at root)")
  .action((dest?: string) => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const { ROOT } = require("./config.js") as { ROOT: string };
    const src = path.join(__dirname, "..", "brain-template", "QUERY_GUIDELINES.md");
    const out = path.resolve(dest ?? path.join(ROOT, "QUERY_GUIDELINES.md"));
    if (!fs.existsSync(src)) { console.error("[add-guidelines] source not found:", src); process.exit(1); }
    if (fs.existsSync(out)) { console.log("[add-guidelines] already exists:", path.relative(ROOT, out)); return; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(src, out);
    console.log("[add-guidelines] created:", path.relative(ROOT, out));
  });

// ── review ────────────────────────────────────────────────────────────────────
program
  .command("review")
  .description("analyse coverage gaps: unindexed files, code with no docs, isolated docs, untested features")
  .option("--json", "output machine-readable JSON")
  .action(async (opts: { json?: boolean }) => {
    const cfg = loadConfig();
    try {
      await runReview(cfg, !!opts.json);
    } finally {
      await closeDriver();
    }
  });

program.parseAsync(process.argv).catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
