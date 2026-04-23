import neo4j, { Driver, Session, Record as Neo4jRecord } from "neo4j-driver";
import { Config } from "../types.js";
export declare function getDriver(cfg: Config): Driver;
export declare function openSession(cfg: Config): Session;
export declare function closeDriver(): Promise<void>;
export declare function toInt(x: number | undefined | null): ReturnType<typeof neo4j.int>;
export declare function unwrapRecord(rec: Neo4jRecord): Record<string, unknown>;
