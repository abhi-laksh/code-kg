import { Config } from "../types.js";
import { openSession, closeDriver } from "../graph/driver.js";
import { unwrapRecord } from "../graph/driver.js";

export async function runPing(cfg: Config): Promise<void> {
  const session = openSession(cfg);
  try {
    console.log(`[ping] connecting to ${cfg.uri} (db: ${cfg.database})…`);
    const t0 = Date.now();

    const versionRes = await session.run(`CALL dbms.components() YIELD name, versions RETURN name, versions`);
    const versionRow = unwrapRecord(versionRes.records[0]);
    const neo4jVersion = ((versionRow.versions as string[]) ?? [])[0] ?? "unknown";

    const countRes = await session.run(`
      CALL () { MATCH (n) RETURN count(n) AS nodes }
      CALL () { MATCH ()-[r]->() RETURN count(r) AS rels }
      RETURN nodes, rels
    `);
    const counts = unwrapRecord(countRes.records[0]);

    const constraintRes = await session.run(`SHOW CONSTRAINTS YIELD name RETURN count(*) AS c`);
    const constraintCount = unwrapRecord(constraintRes.records[0]).c as number;

    const ms = Date.now() - t0;
    console.log(`[ping] OK — ${ms}ms`);
    console.log(`       Neo4j  : ${neo4jVersion}`);
    console.log(`       URI    : ${cfg.uri}`);
    console.log(`       DB     : ${cfg.database}`);
    console.log(`       Nodes  : ${counts.nodes}`);
    console.log(`       Rels   : ${counts.rels}`);
    console.log(`       Constraints: ${constraintCount}`);
  } catch (e: unknown) {
    console.error(`[ping] FAILED — ${(e as Error).message}`);
    console.error(`       Check NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD or .graphrc.json`);
    process.exitCode = 1;
  } finally {
    await session.close();
    await closeDriver();
  }
}
