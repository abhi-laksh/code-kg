export interface Config {
  uri: string;
  username: string;
  password: string;
  database: string;
  project: string;
  ignoreDirs: string[];
  codeExts: string[];
  docExts: string[];
  configFiles: string[];
  configPatterns: string[];
  entryPatterns: string[];
  docScopeParents: string[];
  barePathRegex?: string;
  debounceMs: number;
}

export interface FileInfo {
  path: string;       // relative from project root, forward-slash normalized
  name: string;
  full: string;       // absolute
  lineCount: number;
  ext: string;
  language: string;
  kind: "source" | "test" | "doc" | "config" | "other";
  isTest: boolean;
  isGenerated: boolean;
  isEntryPoint: boolean;
}

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "method" | "interface" | "type" | "enum" | "const" | "property";
  file: string;
  startLine: number;
  endLine: number;
  signature: string;
  isExported: boolean;
  // enriched
  parentName?: string;        // class name for methods/properties
  jsdoc?: string;
  async?: boolean;
  abstract?: boolean;
  static?: boolean;
  visibility?: "public" | "private" | "protected";
  returnType?: string;
  parameters?: string;        // JSON: [{name,type,optional,default}]
  genericParams?: string;     // "T extends Entity, K"
  decoratorNames?: string[];
}

export interface ImportEdge {
  from: string;
  to: string;
}

export interface SymbolKey {
  file: string;
  name: string;
  startLine: number;
}

export interface CallEdge {
  from: SymbolKey;
  to: SymbolKey;
}

/** Generic symbol → symbol edge — reused for all new relationship types */
export interface SymbolEdge {
  from: SymbolKey;
  to: SymbolKey;
}

/** File re-exports a symbol sourced from another module */
export interface ReExportsEdge {
  file: string;
  symbol: SymbolKey;
}

/** Type-only import (import type { X }) — same shape as ImportEdge */
export type ImportTypeEdge = ImportEdge;

export interface DocInfo {
  path: string;
  title: string;
  summary: string;
  scope: string;
  targetPaths: string[];
  plannedPaths: string[];   // path refs in doc that don't exist on disk yet → File{planned:true}
  docLinks: string[];
  id?: string;
  docType?: string;
  name?: string;
  status?: string;
  tags?: string[];
  keywords?: string[];
  updated?: string;
  meta?: Record<string, unknown>;
}

export interface PlanItem {
  doc: string;
  index: number;
  title: string;
  status: "done" | "todo";
  scope: string;
  targetPaths: string[];
}

export interface Decision {
  doc: string;
  index: number;
  title: string;
  reason: string;
  scope: string;
  targetPaths: string[];
}

export interface Constraint {
  doc: string;
  index: number;
  text: string;
  severity: "must" | "should" | "nice";
  scope: string;
  targetPaths: string[];
}

export interface ParsedDocs {
  docs: DocInfo[];
  planItems: PlanItem[];
  decisions: Decision[];
  constraints: Constraint[];
}

export interface GraphCounts {
  Project: number;
  Folder: number;
  File: number;
  ExternalModule: number;
  Symbol: number;
  Doc: number;
  PlanItem: number;
  Decision: number;
  Constraint: number;
  IMPORTS: number;
  IMPORTS_TYPE: number;
  CALLS: number;
  CONNECTS: number;
  EXTENDS: number;
  IMPLEMENTS: number;
  OVERRIDES: number;
  DECORATED_BY: number;
  THROWS: number;
  REFERENCES_TYPE: number;
  INSTANTIATES: number;
  UNION_OF: number;
  INTERSECTION_OF: number;
  RE_EXPORTS: number;
}

export interface GraphReport {
  mode: "rebuild" | "sync";
  changed?: string[];
  removed?: string[];
  total: GraphCounts;
  delta: Partial<GraphCounts> | null;
  durationMs: number;
}
