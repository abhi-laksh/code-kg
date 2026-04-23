import neo4j, { Driver, Session, Record as Neo4jRecord } from "neo4j-driver";
import { Config } from "../types.js";

let _driver: Driver | null = null;

export function getDriver(cfg: Config): Driver {
  if (!_driver) {
    _driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password));
  }
  return _driver;
}

export function openSession(cfg: Config): Session {
  return getDriver(cfg).session({ database: cfg.database });
}

export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

export function toInt(x: number | undefined | null): ReturnType<typeof neo4j.int> {
  return neo4j.int(x ?? 0);
}

export function unwrapRecord(rec: Neo4jRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of rec.keys as string[]) {
    const v = rec.get(k);
    if (v && typeof v === "object" && "low" in (v as object)) {
      out[k] = (v as { low: number }).low;
    } else {
      out[k] = v;
    }
  }
  return out;
}
