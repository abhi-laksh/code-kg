import fs from "fs";
import path from "path";
import * as readline from "readline";
import { ROOT, defaultGraphrc } from "../config.js";
import { openSession, closeDriver } from "../graph/driver.js";
import { Config } from "../types.js";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function prompt(label: string, defaultVal: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await ask(rl, `  ${label} (${defaultVal}): `);
  rl.close();
  return answer.trim() || defaultVal;
}

async function tryPing(cfg: Config): Promise<void> {
  const session = openSession(cfg);
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
  } catch {
    console.log(`
  Could not reach Neo4j at ${cfg.uri}.
  Make sure Neo4j is running before you use code-kg.

  Download Neo4j Desktop  → https://neo4j.com/download/
  Or run via Docker       → https://hub.docker.com/_/neo4j

  Your .graphrc.json has been saved — run \`code-kg ping\` once Neo4j is up.
`);
  } finally {
    await session.close();
    await closeDriver();
  }
}

export async function runInit(projectName?: string): Promise<void> {
  const name = projectName ?? path.basename(ROOT);

  console.log("\n[init] Setting up code-kg for this project\n");

  const database = await prompt("Neo4j database", "neo4j");
  const uri      = await prompt("Neo4j URI",      "bolt://localhost:7687");
  const username = await prompt("Username",        "neo4j");
  const password = await prompt("Password",        "neo4j");

  const rc = {
    ...defaultGraphrc(name),
    uri,
    username,
    password,
    database,
  };

  const rcPath = path.join(ROOT, ".graphrc.json");
  if (fs.existsSync(rcPath)) {
    console.log("\n  skipped  .graphrc.json (already exists)");
  } else {
    fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + "\n");
    console.log("\n  created  .graphrc.json");
  }

  const cfg: Config = {
    uri,
    username,
    password,
    database,
    project: name,
    ignoreDirs: ((rc as Record<string, unknown>).ignoreDirs as string[] | undefined) ?? [],
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
