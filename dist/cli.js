#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const config_js_1 = require("./config.js");
const driver_js_1 = require("./graph/driver.js");
const init_js_1 = require("./commands/init.js");
const init_templates_js_1 = require("./commands/init-templates.js");
const rebuild_js_1 = require("./commands/rebuild.js");
const sync_js_1 = require("./commands/sync.js");
const watch_js_1 = require("./commands/watch.js");
const ping_js_1 = require("./commands/ping.js");
const new_js_1 = require("./commands/new.js");
const review_js_1 = require("./commands/review.js");
const program = new commander_1.Command();
program
    .name("code-kg")
    .description("Neo4j knowledge graph sync for TypeScript projects")
    .version("0.1.0");
// ── init ───────────────────────────────────────────────────────────────────────
program
    .command("init [projectName]")
    .description("configure .graphrc.json with Neo4j credentials and verify the connection")
    .action(async (projectName) => {
    await (0, init_js_1.runInit)(projectName);
});
// ── init-templates ────────────────────────────────────────────────────────────
program
    .command("init-templates")
    .description("scaffold brain-template knowledge base docs structure in the current project")
    .action(async () => {
    await (0, init_templates_js_1.runInitTemplates)();
});
// ── ping ──────────────────────────────────────────────────────────────────────
program
    .command("ping")
    .description("verify Neo4j connection and show db stats")
    .action(async () => {
    const cfg = (0, config_js_1.loadConfig)();
    await (0, ping_js_1.runPing)(cfg);
});
// ── rebuild ───────────────────────────────────────────────────────────────────
program
    .command("rebuild")
    .description("wipe the graph and re-index the entire project from scratch")
    .option("--fast", "use fast name-based call resolution instead of accurate type-following")
    .action(async (opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    try {
        await (0, rebuild_js_1.runRebuild)(cfg, !!opts.fast);
    }
    finally {
        await (0, driver_js_1.closeDriver)();
    }
});
// ── sync ──────────────────────────────────────────────────────────────────────
program
    .command("sync [paths...]")
    .description("incrementally update the graph for the given file paths (omit to auto-detect via git)")
    .option("--fast", "use fast name-based call resolution")
    .action(async (paths, opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    try {
        await (0, sync_js_1.runSync)(paths ?? [], cfg, !!opts.fast);
    }
    finally {
        await (0, driver_js_1.closeDriver)();
    }
});
// ── watch ─────────────────────────────────────────────────────────────────────
program
    .command("watch")
    .description("watch for file changes via watchman and keep the graph in sync")
    .option("--fast", "use fast name-based call resolution")
    .action(async (opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    await (0, watch_js_1.runWatch)(cfg, !!opts.fast);
    // stays alive — watch manages its own process lifecycle
});
// ── new ───────────────────────────────────────────────────────────────────────
program
    .command("new <type> <path>")
    .description("create a new knowledge-base doc from a template\n" +
    "  types: architecture\n" +
    "         app\n" +
    "         feature, subfeature\n" +
    "         task, subtask, migration, refactor\n" +
    "         code, function, component, hook, service, module, api, schema\n" +
    "         test\n" +
    "         edge-case, edge\n" +
    "         tool")
    .action((type, destPath) => {
    (0, new_js_1.runNew)(type, destPath);
});
// ── add-guidelines ───────────────────────────────────────────────────────────
program
    .command("add-guidelines [dest]")
    .description("copy QUERY_GUIDELINES.md into the project (default: QUERY_GUIDELINES.md at root)")
    .action((dest) => {
    const fs = require("fs");
    const path = require("path");
    const { ROOT } = require("./config.js");
    const src = path.join(__dirname, "..", "brain-template", "QUERY_GUIDELINES.md");
    const out = path.resolve(dest ?? path.join(ROOT, "QUERY_GUIDELINES.md"));
    if (!fs.existsSync(src)) {
        console.error("[add-guidelines] source not found:", src);
        process.exit(1);
    }
    if (fs.existsSync(out)) {
        console.log("[add-guidelines] already exists:", path.relative(ROOT, out));
        return;
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(src, out);
    console.log("[add-guidelines] created:", path.relative(ROOT, out));
});
// ── review ────────────────────────────────────────────────────────────────────
program
    .command("review")
    .description("analyse coverage gaps: unindexed files, code with no docs, isolated docs, untested features")
    .option("--json", "output machine-readable JSON")
    .action(async (opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    try {
        await (0, review_js_1.runReview)(cfg, !!opts.json);
    }
    finally {
        await (0, driver_js_1.closeDriver)();
    }
});
program.parseAsync(process.argv).catch((e) => {
    console.error(e.message);
    process.exit(1);
});
