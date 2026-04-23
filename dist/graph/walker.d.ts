import { Config, FileInfo } from "../types.js";
export declare function normalizePath(p: string): string;
interface GitignoreRule {
    negate: boolean;
    raw: string;
    anchored: boolean;
    directoryOnly: boolean;
    regex: RegExp;
    normalizedSource: string;
}
export declare function buildIgnoreMatcher(rules: GitignoreRule[]): (relPath: string) => boolean;
export declare function classifyFile(relPath: string, cfg: Config, entryPatterns: RegExp[]): Omit<FileInfo, "path" | "name" | "full" | "lineCount">;
export interface WalkResult {
    folders: string[];
    files: FileInfo[];
    isIgnored: (relPath: string) => boolean;
}
export declare function walkRepo(cfg: Config): WalkResult;
export declare function buildFileInfo(relPath: string, cfg: Config): FileInfo;
export declare function ancestorFolders(filePath: string): string[];
export {};
