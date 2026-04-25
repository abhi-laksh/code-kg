import fs from "fs";
import path from "path";
import { Config, FileInfo } from "../types.js";
import { ROOT } from "../config.js";

// ── path utils ────────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  return p.split(path.sep).join("/");
}

function escapeRegex(v: string): string {
  return v.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    const next = pattern[i + 1];
    if (c === "*") {
      if (next === "*") {
        out += ".*";
        i++;
        if (pattern[i + 1] === "/") i++;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "/") {
      out += "\\/";
    } else {
      out += escapeRegex(c);
    }
  }
  return new RegExp(out + "$");
}

// ── gitignore ─────────────────────────────────────────────────────────────────

interface GitignoreRule {
  negate: boolean;
  raw: string;
  anchored: boolean;
  directoryOnly: boolean;
  regex: RegExp;
  normalizedSource: string;
}

function parseIgnoreFile(filePath: string): GitignoreRule[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const negate = l.startsWith("!");
      const raw = negate ? l.slice(1) : l;
      const norm = normalizePath(raw);
      const directoryOnly = norm.endsWith("/");
      const source = directoryOnly ? norm.slice(0, -1) : norm;
      // gitignore spec: pattern with "/" anywhere (except trailing) is anchored to repo root.
      const hasLeadingSlash = source.startsWith("/");
      const stripped = hasLeadingSlash ? source.slice(1) : source;
      const anchored = hasLeadingSlash || (stripped.includes("/") && !stripped.startsWith("**/"));
      return { negate, raw, anchored, directoryOnly, regex: globToRegExp(stripped), normalizedSource: stripped };
    });
}

function loadGitignoreRules(): GitignoreRule[] {
  return [
    ...parseIgnoreFile(path.join(ROOT, ".gitignore")),
    ...parseIgnoreFile(path.join(ROOT, ".codekgignore")),
  ];
}

export function buildIgnoreMatcher(rules: GitignoreRule[]): (relPath: string) => boolean {
  return function isIgnored(relPath: string): boolean {
    const normalized = normalizePath(relPath);
    const parts = normalized.split("/");
    let ignored = false;
    for (const rule of rules) {
      const candidates: string[] = [];
      if (rule.anchored) {
        candidates.push(normalized);
      } else {
        candidates.push(normalized, ...parts);
        for (let i = 1; i < parts.length; i++) candidates.push(parts.slice(i).join("/"));
      }
      const matched = candidates.some((c) => {
        if (!c) return false;
        if (rule.directoryOnly || rule.anchored) {
          // exact match OR child of this path OR regex match
          return c === rule.normalizedSource
            || c.startsWith(`${rule.normalizedSource}/`)
            || rule.regex.test(c);
        }
        return rule.regex.test(c);
      });
      if (matched) ignored = !rule.negate;
    }
    return ignored;
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
  const rules = loadGitignoreRules();
  const isIgnored = buildIgnoreMatcher(rules);
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
