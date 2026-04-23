import { Config, FileInfo, SymbolInfo, ImportEdge, CallEdge, ParsedDocs } from "../types.js";
export declare function addOrRefreshSourceFile(fullPath: string): import("ts-morph").SourceFile | null;
export declare function removeSourceFile(fullPath: string): void;
export declare function warmTsProject(files: FileInfo[]): void;
export declare function resolveImport(fromFile: string, specifier: string): {
    target: string;
    external: boolean;
};
export interface ParsedCode {
    file: FileInfo;
    symbols: SymbolInfo[];
    imports: ImportEdge[];
}
export declare function parseSourceFile(sf: ReturnType<typeof addOrRefreshSourceFile>, relPath: string): {
    symbols: SymbolInfo[];
    imports: ImportEdge[];
};
export declare function parseCodeFiles(fileInfos: FileInfo[]): ParsedCode[];
type SymbolIndex = Map<string, SymbolInfo>;
export declare function buildSymbolIndex(symbols: SymbolInfo[]): SymbolIndex;
export declare function resolveCallsAccurate(entries: ParsedCode[], idx: SymbolIndex): CallEdge[];
export declare function resolveCallsFast(entries: ParsedCode[], idx: SymbolIndex): CallEdge[];
export declare function parseDocs(docFiles: FileInfo[], allPaths: string[], cfg: Config): ParsedDocs;
export {};
