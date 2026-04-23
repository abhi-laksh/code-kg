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
    path: string;
    name: string;
    full: string;
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
    kind: "function" | "class" | "method" | "interface" | "type" | "enum" | "const";
    file: string;
    startLine: number;
    endLine: number;
    signature: string;
    isExported: boolean;
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
export interface DocInfo {
    path: string;
    title: string;
    summary: string;
    scope: string;
    targetPaths: string[];
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
    CALLS: number;
}
export interface GraphReport {
    mode: "rebuild" | "sync";
    changed?: string[];
    removed?: string[];
    total: GraphCounts;
    delta: Partial<GraphCounts> | null;
    durationMs: number;
}
