"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const readline = __importStar(require("readline"));
const config_js_1 = require("../config.js");
const driver_js_1 = require("../graph/driver.js");
function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}
async function prompt(label, defaultVal) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await ask(rl, `  ${label} (${defaultVal}): `);
    rl.close();
    return answer.trim() || defaultVal;
}
async function tryPing(cfg) {
    const session = (0, driver_js_1.openSession)(cfg);
    try {
        const t0 = Date.now();
        await session.run("RETURN 1");
        const ms = Date.now() - t0;
        console.log(`
  Connected to Neo4j in ${ms}ms — you're all set!

  Next steps:
    code-kg rebuild    — index your codebase
    code-kg watch      — keep it in sync while you work
    code-kg init-templates  — scaffold knowledge base docs
`);
    }
    catch {
        console.log(`
  Could not reach Neo4j at ${cfg.uri}.
  Make sure Neo4j is running before you use code-kg.

  Download Neo4j Desktop  → https://neo4j.com/download/
  Or run via Docker       → https://hub.docker.com/_/neo4j

  Your .graphrc.json has been saved — run \`code-kg ping\` once Neo4j is up.
`);
    }
    finally {
        await session.close();
        await (0, driver_js_1.closeDriver)();
    }
}
async function runInit(projectName) {
    const name = projectName ?? path_1.default.basename(config_js_1.ROOT);
    console.log("\n[init] Setting up code-kg for this project\n");
    const database = await prompt("Neo4j database", "neo4j");
    const uri = await prompt("Neo4j URI", "bolt://localhost:7687");
    const username = await prompt("Username", "neo4j");
    const password = await prompt("Password", "neo4j");
    const rc = {
        ...(0, config_js_1.defaultGraphrc)(name),
        uri,
        username,
        password,
        database,
    };
    const rcPath = path_1.default.join(config_js_1.ROOT, ".graphrc.json");
    if (fs_1.default.existsSync(rcPath)) {
        console.log("\n  skipped  .graphrc.json (already exists)");
    }
    else {
        fs_1.default.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + "\n");
        console.log("\n  created  .graphrc.json");
    }
    const cfg = {
        uri,
        username,
        password,
        database,
        project: name,
        ignoreDirs: rc.ignoreDirs ?? [],
        codeExts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
        docExts: [".md", ".mdx"],
        configFiles: ["package.json", "tsconfig.json", "Dockerfile"],
        configPatterns: ["^tsconfig.*\\.json$", "\\.ya?ml$", "\\.tf$", "^\\.env.*"],
        entryPatterns: [],
        docScopeParents: ["features", "modules", "domains", "packages", "apps"],
        debounceMs: 2000,
    };
    console.log("\n  Pinging Neo4j…");
    await tryPing(cfg);
}
