"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT = void 0;
exports.loadConfig = loadConfig;
exports.defaultGraphrc = defaultGraphrc;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.ROOT = process.cwd();
const CONFIG_FILE = path_1.default.join(exports.ROOT, ".graphrc.json");
function loadConfig() {
    let file = {};
    if (fs_1.default.existsSync(CONFIG_FILE)) {
        try {
            file = JSON.parse(fs_1.default.readFileSync(CONFIG_FILE, "utf-8"));
        }
        catch (e) {
            console.warn(`[code-kg] failed to parse .graphrc.json: ${e.message}`);
        }
    }
    function pick(envKey, cfgKey, fallback) {
        const env = process.env[envKey];
        if (env != null && env !== "")
            return env;
        if (file[cfgKey] != null)
            return file[cfgKey];
        return fallback;
    }
    return {
        uri: pick("NEO4J_URI", "uri", "bolt://localhost:7687"),
        username: pick("NEO4J_USERNAME", "username", "neo4j"),
        password: pick("NEO4J_PASSWORD", "password", "neo4j"),
        database: pick("NEO4J_DATABASE", "database", "neo4j"),
        project: pick("GRAPH_PROJECT", "project", path_1.default.basename(exports.ROOT)),
        ignoreDirs: file.ignoreDirs ?? [
            "node_modules", ".git", "dist", "build", ".next", ".turbo",
            ".nuxt", ".svelte-kit", ".output", "coverage", ".terraform", ".cache", "out",
        ],
        codeExts: file.codeExts ?? [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
        docExts: file.docExts ?? [".md", ".mdx"],
        configFiles: file.configFiles ?? ["package.json", "tsconfig.json", "Dockerfile"],
        configPatterns: file.configPatterns ?? ["^tsconfig.*\\.json$", "\\.ya?ml$", "\\.tf$", "^\\.env.*"],
        entryPatterns: file.entryPatterns ?? [],
        docScopeParents: file.docScopeParents ?? ["features", "modules", "domains", "packages", "apps"],
        barePathRegex: file.barePathRegex,
        debounceMs: pick("GRAPH_DEBOUNCE_MS", "debounceMs", 2000),
    };
}
function defaultGraphrc(projectName) {
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
