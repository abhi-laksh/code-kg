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
    .action(() => {
    (0, init_templates_js_1.runInitTemplates)();
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
    .command("sync <paths...>")
    .description("incrementally update the graph for the given file paths")
    .option("--fast", "use fast name-based call resolution")
    .action(async (paths, opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    try {
        await (0, sync_js_1.runSync)(paths, cfg, !!opts.fast);
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
    "  types: feature, subfeature, task, flow, error, edge-case, test-case,\n" +
    "         page, component, state, function, architecture, adr")
    .action((type, destPath) => {
    (0, new_js_1.runNew)(type, destPath);
});
program.parseAsync(process.argv).catch((e) => {
    console.error(e.message);
    process.exit(1);
});
