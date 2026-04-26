"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePath = normalizePath;
exports.buildIgnoreMatcher = buildIgnoreMatcher;
exports.classifyFile = classifyFile;
exports.walkRepo = walkRepo;
exports.buildFileInfo = buildFileInfo;
exports.ancestorFolders = ancestorFolders;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ignore_1 = __importDefault(require("ignore"));
const config_js_1 = require("../config.js");
// ── path utils ────────────────────────────────────────────────────────────────
function normalizePath(p) {
    return p.split(path_1.default.sep).join("/");
}
// ── ignore engine (gitignore + .codekgignore via `ignore` pkg) ────────────────
function buildIgnoreEngine() {
    const ig = (0, ignore_1.default)();
    for (const name of [".gitignore", ".codekgignore"]) {
        const p = path_1.default.join(config_js_1.ROOT, name);
        if (fs_1.default.existsSync(p))
            ig.add(fs_1.default.readFileSync(p, "utf-8"));
    }
    return ig;
}
function buildIgnoreMatcher(ig) {
    return (relPath) => {
        const norm = normalizePath(relPath);
        if (!norm || norm === ".")
            return false;
        return ig.ignores(norm);
    };
}
// ── file classification ───────────────────────────────────────────────────────
const LANGUAGE_MAP = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".mjs": "javascript", ".cjs": "javascript",
    ".md": "markdown", ".mdx": "markdown",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".sql": "sql", ".tf": "terraform", ".sh": "shell",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".css": "css", ".scss": "scss", ".html": "html",
};
function buildEntryPatterns(cfg) {
    if (cfg.entryPatterns.length)
        return cfg.entryPatterns.map((s) => new RegExp(s));
    const pats = [
        /^(?:src\/)?index\.(ts|tsx|js|jsx|mjs|cjs)$/,
        /^(?:src\/)?main\.(ts|tsx|js|jsx|mjs|cjs)$/,
        /^(?:src\/)?server\.(ts|js|mjs|cjs)$/,
        /^(?:apps|packages)\/[^/]+\/src\/(index|main|server)\.(ts|tsx|js|jsx|mjs|cjs)$/,
        /(?:^|\/)middleware\.(ts|tsx|js|jsx)$/,
        /(?:^|\/)(page|layout|route|loading|error|not-found|template)\.(tsx|ts|jsx|js)$/,
    ];
    if (fs_1.default.existsSync(path_1.default.join(config_js_1.ROOT, "index.html")))
        pats.push(/^index\.html$/);
    return pats;
}
function safeLineCount(fullPath) {
    try {
        return fs_1.default.readFileSync(fullPath, "utf-8").split(/\r?\n/).length;
    }
    catch {
        return 0;
    }
}
function classifyFile(relPath, cfg, entryPatterns) {
    const base = path_1.default.basename(relPath);
    const ext = path_1.default.extname(base);
    const parts = relPath.split(/[\\/]/);
    const codeExts = new Set(cfg.codeExts);
    const docExts = new Set(cfg.docExts);
    const configFiles = new Set(cfg.configFiles);
    const configPatternRx = cfg.configPatterns.map((s) => new RegExp(s));
    const isTest = /\.(test|spec)\./.test(base) ||
        parts.includes("__tests__") ||
        parts.some((p) => p === "test" || p === "tests");
    let kind = "other";
    if (docExts.has(ext))
        kind = "doc";
    else if (codeExts.has(ext))
        kind = isTest ? "test" : "source";
    else if (configFiles.has(base) || configPatternRx.some((rx) => rx.test(base)))
        kind = "config";
    const isGenerated = parts.includes(".next") || parts.includes("dist") || parts.includes("build") || base.endsWith(".d.ts");
    const norm = normalizePath(relPath);
    const isEntryPoint = entryPatterns.some((rx) => rx.test(norm));
    return { ext, language: LANGUAGE_MAP[ext] ?? (ext.slice(1) || "unknown"), kind, isTest, isGenerated, isEntryPoint };
}
function walkRepo(cfg) {
    const ig = buildIgnoreEngine();
    const isIgnored = buildIgnoreMatcher(ig);
    const entryPatterns = buildEntryPatterns(cfg);
    const ignoreSet = new Set(cfg.ignoreDirs);
    const folders = [];
    const files = [];
    function walk(dir) {
        const rel = normalizePath(path_1.default.relative(config_js_1.ROOT, dir)) || ".";
        if (rel !== "." && (ignoreSet.has(path_1.default.basename(dir)) || isIgnored(rel)))
            return;
        folders.push(rel);
        for (const item of fs_1.default.readdirSync(dir)) {
            const full = path_1.default.join(dir, item);
            const stat = fs_1.default.statSync(full);
            const relItem = normalizePath(path_1.default.relative(config_js_1.ROOT, full));
            if (ignoreSet.has(item) || isIgnored(relItem))
                continue;
            if (stat.isDirectory()) {
                walk(full);
            }
            else {
                const meta = classifyFile(relItem, cfg, entryPatterns);
                files.push({
                    path: relItem,
                    name: path_1.default.basename(relItem),
                    full,
                    lineCount: safeLineCount(full),
                    ...meta,
                });
            }
        }
    }
    walk(config_js_1.ROOT);
    return { folders, files, isIgnored };
}
function buildFileInfo(relPath, cfg) {
    const full = path_1.default.join(config_js_1.ROOT, relPath);
    const entryPatterns = buildEntryPatterns(cfg);
    const meta = classifyFile(relPath, cfg, entryPatterns);
    return {
        path: normalizePath(relPath),
        name: path_1.default.basename(relPath),
        full,
        lineCount: safeLineCount(full),
        ...meta,
    };
}
function ancestorFolders(filePath) {
    const out = [];
    let cur = path_1.default.dirname(filePath);
    while (cur && cur !== ".") {
        out.push(normalizePath(cur));
        const parent = path_1.default.dirname(cur);
        if (parent === cur)
            break;
        cur = parent;
    }
    out.push(".");
    return out;
}
