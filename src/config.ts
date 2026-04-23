import fs from "fs";
import path from "path";
import { Config } from "./types.js";

export const ROOT = process.cwd();
const CONFIG_FILE = path.join(ROOT, ".graphrc.json");

export function loadConfig(): Config {
  let file: Record<string, unknown> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      file = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (e: unknown) {
      console.warn(`[code-kg] failed to parse .graphrc.json: ${(e as Error).message}`);
    }
  }

  function pick<T>(envKey: string, cfgKey: string, fallback: T): T {
    const env = process.env[envKey];
    if (env != null && env !== "") return env as unknown as T;
    if (file[cfgKey] != null) return file[cfgKey] as T;
    return fallback;
  }

  return {
    uri:      pick("NEO4J_URI",      "uri",      "bolt://localhost:7687"),
    username: pick("NEO4J_USERNAME", "username", "neo4j"),
    password: pick("NEO4J_PASSWORD", "password", "neo4j"),
    database: pick("NEO4J_DATABASE", "database", "neo4j"),
    project:  pick("GRAPH_PROJECT",  "project",  path.basename(ROOT)),
    ignoreDirs: (file.ignoreDirs as string[] | undefined) ?? [
      "node_modules", ".git", "dist", "build", ".next", ".turbo",
      ".nuxt", ".svelte-kit", ".output", "coverage", ".terraform", ".cache", "out",
    ],
    codeExts:       (file.codeExts      as string[] | undefined) ?? [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    docExts:        (file.docExts       as string[] | undefined) ?? [".md", ".mdx"],
    configFiles:    (file.configFiles   as string[] | undefined) ?? ["package.json", "tsconfig.json", "Dockerfile"],
    configPatterns: (file.configPatterns as string[] | undefined) ?? ["^tsconfig.*\\.json$", "\\.ya?ml$", "\\.tf$", "^\\.env.*"],
    entryPatterns:  (file.entryPatterns as string[] | undefined) ?? [],
    docScopeParents:(file.docScopeParents as string[] | undefined) ?? ["features", "modules", "domains", "packages", "apps"],
    barePathRegex:   file.barePathRegex as string | undefined,
    debounceMs:      pick("GRAPH_DEBOUNCE_MS", "debounceMs", 2000) as unknown as number,
  };
}

export function defaultGraphrc(projectName: string): Record<string, unknown> {
  return {
    project: projectName,
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "neo4j",
    database: "neo4j",
    ignoreDirs: [
      "node_modules", ".git", "dist", "build", ".next", ".turbo",
      "coverage", ".cache", "out",
    ],
  };
}
