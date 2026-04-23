"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPing = runPing;
const driver_js_1 = require("../graph/driver.js");
const driver_js_2 = require("../graph/driver.js");
async function runPing(cfg) {
    const session = (0, driver_js_1.openSession)(cfg);
    try {
        console.log(`[ping] connecting to ${cfg.uri} (db: ${cfg.database})…`);
        const t0 = Date.now();
        const versionRes = await session.run(`CALL dbms.components() YIELD name, versions RETURN name, versions`);
        const versionRow = (0, driver_js_2.unwrapRecord)(versionRes.records[0]);
        const neo4jVersion = (versionRow.versions ?? [])[0] ?? "unknown";
        const countRes = await session.run(`
      CALL () { MATCH (n) RETURN count(n) AS nodes }
      CALL () { MATCH ()-[r]->() RETURN count(r) AS rels }
      RETURN nodes, rels
    `);
        const counts = (0, driver_js_2.unwrapRecord)(countRes.records[0]);
        const constraintRes = await session.run(`SHOW CONSTRAINTS YIELD name RETURN count(*) AS c`);
        const constraintCount = (0, driver_js_2.unwrapRecord)(constraintRes.records[0]).c;
        const ms = Date.now() - t0;
        console.log(`[ping] OK — ${ms}ms`);
        console.log(`       Neo4j  : ${neo4jVersion}`);
        console.log(`       URI    : ${cfg.uri}`);
        console.log(`       DB     : ${cfg.database}`);
        console.log(`       Nodes  : ${counts.nodes}`);
        console.log(`       Rels   : ${counts.rels}`);
        console.log(`       Constraints: ${constraintCount}`);
    }
    catch (e) {
        console.error(`[ping] FAILED — ${e.message}`);
        console.error(`       Check NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD or .graphrc.json`);
        process.exitCode = 1;
    }
    finally {
        await session.close();
        await (0, driver_js_1.closeDriver)();
    }
}
