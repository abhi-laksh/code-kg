import { Config } from "./types.js";
export declare const ROOT: string;
export declare function loadConfig(): Config;
export declare function defaultGraphrc(projectName: string): Record<string, unknown>;
