import fs from "fs";
import path from "path";
import ignore, { Ignore } from "ignore";
import { Config, FileInfo } from "../types.js";
import { ROOT } from "../config.js";

// ── path utils ────────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  return p.split(path.sep).join("/");
}

// ── ignore engine (gitignore + .codekgignore via `ignore` pkg) ────────────────

function buildIgnoreEngine(): Ignore {
  const ig = ignore();
  for (const name of [".gitignore", ".codekgignore"]) {
    const p = path.join(ROOT, name);
    if (fs.existsSync(p)) ig.add(fs.readFileSync(p, "utf-8"));
  }
  return ig;
}

export function buildIgnoreMatcher(ig: Ignore): (relPath: string) => boolean {
  return (relPath: string) => {
    const norm = normalizePath(relPath);
    if (!norm || norm === ".") return false;
    return ig.ignores(norm);
  };
}

// ── file classification ───────────────────────────────────────────────────────

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
  ".mjs": "javascript", ".cjs": "javascript",
  ".md": "markdown", ".mdx": "markdown",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml",
  ".sql": "sql", ".tf": "terraform", ".sh": "shell",
  ".py": "python", ".go": "go", ".rs": "rust",
  ".css": "css", ".scss": "scss", ".html": "html",
};

function buildEntryPatterns(cfg: Config): RegExp[] {
  if (cfg.entryPatterns.length) return cfg.entryPatterns.map((s) => new RegExp(s));
  const pats: RegExp[] = [
    /^(?:src\/)?index\.(ts|tsx|js|jsx|mjs|cjs)$/,
    /^(?:src\/)?main\.(ts|tsx|js|jsx|mjs|cjs)$/,
    /^(?:src\/)?server\.(ts|js|mjs|cjs)$/,
    /^(?:apps|packages)\/[^/]+\/src\/(index|main|server)\.(ts|tsx|js|jsx|mjs|cjs)$/,
    /(?:^|\/)middleware\.(ts|tsx|js|jsx)$/,
    /(?:^|\/)(page|layout|route|loading|error|not-found|template)\.(tsx|ts|jsx|js)$/,
  ];
  if (fs.existsSync(path.join(ROOT, "index.html"))) pats.push(/^index\.html$/);
  return pats;
}

function safeLineCount(fullPath: string): number {
  try { return fs.readFileSync(fullPath, "utf-8").split(/\r?\n/).length; }
  catch { return 0; }
}

export function classifyFile(relPath: string, cfg: Config, entryPatterns: RegExp[]): Omit<FileInfo, "path" | "name" | "full" | "lineCount"> {
  const base = path.basename(relPath);
  const ext = path.extname(base);
  const parts = relPath.split(/[\\/]/);
  const codeExts = new Set(cfg.codeExts);
  const docExts = new Set(cfg.docExts);
  const configFiles = new Set(cfg.configFiles);
  const configPatternRx = cfg.configPatterns.map((s) => new RegExp(s));

  const isTest =
    /\.(test|spec)\./.test(base) ||
    parts.includes("__tests__") ||
    parts.some((p) => p === "test" || p === "tests");

  let kind: FileInfo["kind"] = "other";
  if (docExts.has(ext)) kind = "doc";
  else if (codeExts.has(ext)) kind = isTest ? "test" : "source";
  else if (configFiles.has(base) || configPatternRx.some((rx) => rx.test(base))) kind = "config";

  const isGenerated =
    parts.includes(".next") || parts.includes("dist") || parts.includes("build") || base.endsWith(".d.ts");

  const norm = normalizePath(relPath);
  const isEntryPoint = entryPatterns.some((rx) => rx.test(norm));

  return { ext, language: LANGUAGE_MAP[ext] ?? (ext.slice(1) || "unknown"), kind, isTest, isGenerated, isEntryPoint };
}

// ── walk ──────────────────────────────────────────────────────────────────────

export interface WalkResult {
  folders: string[];
  files: FileInfo[];
  isIgnored: (relPath: string) => boolean;
}

export function walkRepo(cfg: Config): WalkResult {
  const ig = buildIgnoreEngine();
  const isIgnored = buildIgnoreMatcher(ig);
  const entryPatterns = buildEntryPatterns(cfg);
  const ignoreSet = new Set(cfg.ignoreDirs);
  const folders: string[] = [];
  const files: FileInfo[] = [];

  function walk(dir: string): void {
    const rel = normalizePath(path.relative(ROOT, dir)) || ".";
    if (rel !== "." && (ignoreSet.has(path.basename(dir)) || isIgnored(rel))) return;
    folders.push(rel);
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      const relItem = normalizePath(path.relative(ROOT, full));
      if (ignoreSet.has(item) || isIgnored(relItem)) continue;
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const meta = classifyFile(relItem, cfg, entryPatterns);
        files.push({
          path: relItem,
          name: path.basename(relItem),
          full,
          lineCount: safeLineCount(full),
          ...meta,
        });
      }
    }
  }

  walk(ROOT);
  return { folders, files, isIgnored };
}

export function buildFileInfo(relPath: string, cfg: Config): FileInfo {
  const full = path.join(ROOT, relPath);
  const entryPatterns = buildEntryPatterns(cfg);
  const meta = classifyFile(relPath, cfg, entryPatterns);
  return {
    path: normalizePath(relPath),
    name: path.basename(relPath),
    full,
    lineCount: safeLineCount(full),
    ...meta,
  };
}

export function ancestorFolders(filePath: string): string[] {
  const out: string[] = [];
  let cur = path.dirname(filePath);
  while (cur && cur !== ".") {
    out.push(normalizePath(cur));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  out.push(".");
  return out;
}
