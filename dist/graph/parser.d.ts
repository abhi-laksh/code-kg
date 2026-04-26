import { Config, FileInfo, SymbolInfo, ImportEdge, CallEdge, SymbolEdge, ReExportsEdge, ImportTypeEdge, ParsedDocs } from "../types.js";
export declare function addOrRefreshSourceFile(fullPath: string): import("ts-morph").SourceFile | null;
export declare function removeSourceFile(fullPath: string): void;
export declare function warmTsProject(files: FileInfo[]): void;
export declare function resolveImport(fromFile: string, specifier: string): {
    target: string;
    external: boolean;
};
export interface ParseSourceFileResult {
    symbols: SymbolInfo[];
    imports: ImportEdge[];
    importTypes: ImportTypeEdge[];
    extends: SymbolEdge[];
    implements: SymbolEdge[];
    overrides: SymbolEdge[];
    decoratedBy: SymbolEdge[];
    throws: SymbolEdge[];
    referencesType: SymbolEdge[];
    instantiates: SymbolEdge[];
    unionOf: SymbolEdge[];
    intersectionOf: SymbolEdge[];
    reExports: ReExportsEdge[];
}
export interface ParsedCode extends ParseSourceFileResult {
    file: FileInfo;
}
export declare function parseSourceFile(sf: ReturnType<typeof addOrRefreshSourceFile>, relPath: string): ParseSourceFileResult;
export declare function parseCodeFiles(fileInfos: FileInfo[]): ParsedCode[];
type SymbolIndex = Map<string, SymbolInfo>;
export declare function buildSymbolIndex(symbols: SymbolInfo[]): SymbolIndex;
export declare function resolveCallsAccurate(entries: ParsedCode[], idx: SymbolIndex): CallEdge[];
export declare function resolveCallsFast(entries: ParsedCode[], idx: SymbolIndex): CallEdge[];
export declare function parseDocs(docFiles: FileInfo[], allPaths: string[], cfg: Config): ParsedDocs;
export {};
