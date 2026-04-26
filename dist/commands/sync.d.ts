import { Config, GraphReport } from "../types.js";
export declare function runSync(inputPaths: string[], cfg: Config, fast?: boolean): Promise<GraphReport | null>;
export declare function applyBatch({ changed, removed }: {
    changed: string[];
    removed: string[];
}, cfg: Config, fast?: boolean): Promise<GraphReport>;
