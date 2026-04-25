import { Config } from "../types.js";
import { openSession } from "../graph/driver.js";
import { walkRepo } from "../graph/walker.js";

interface ReviewIssue {
  severity: "ERROR" | "WARN" | "INFO";
  check: string;
  count: number;
  items: string[];
}

interface ReviewReport {
  checks: ReviewIssue[];
  summary: { errors: number; warnings: number; info: number };
}

export async function runReview(cfg: Config, asJson = false): Promise<void> {
  const session = openSession(cfg);
  const issues: ReviewIssue[] = [];

  try {
    // 1. Files on disk vs indexed in graph
    const { files: localFiles } = walkRepo(cfg);
    const localPaths = new Set(localFiles.map((f) => f.path));

    const indexedRes = await session.run(`MATCH (f:File) RETURN f.path AS p`);
    const indexedPaths = new Set(indexedRes.records.map((r) => r.get("p") as string));

    const unindexed = [...localPaths].filter((p) => !indexedPaths.has(p));
    issues.push({
      severity: "ERROR",
      check: "Files on disk not in graph (need sync)",
      count: unindexed.length,
      items: unindexed,
    });

    // 2. Code files with no doc targeting them
    const noDocRes = await session.run(`
      MATCH (f:File)
      WHERE f.kind = 'code' AND NOT (f)<-[:TARGETS]-(:Doc)
      RETURN f.path AS p
      ORDER BY p
    `);
    const noDocFiles = noDocRes.records.map((r) => r.get("p") as string);
    issues.push({
      severity: "WARN",
      check: "Code files with no doc",
      count: noDocFiles.length,
      items: noDocFiles,
    });

    // 3. Exported symbols never called and not referenced by any doc
    const deadSymRes = await session.run(`
      MATCH (s:Symbol)
      WHERE s.isExported = true
        AND NOT (s)<-[:CALLS]-()
        AND NOT ()-[:TARGETS]->(s)
      RETURN s.file + '::' + s.name AS sym
      ORDER BY sym
      LIMIT 100
    `);
    const deadSymbols = deadSymRes.records.map((r) => r.get("sym") as string);
    issues.push({
      severity: "WARN",
      check: "Exported symbols never called and not documented (top 100)",
      count: deadSymbols.length,
      items: deadSymbols,
    });

    // 4. Doc files on disk not in graph
    const localDocPaths = localFiles.filter((f) => f.ext === ".md" || f.ext === ".mdx").map((f) => f.path);
    const indexedDocsRes = await session.run(`MATCH (d:Doc) RETURN d.path AS p`);
    const indexedDocPaths = new Set(indexedDocsRes.records.map((r) => r.get("p") as string));
    const unindexedDocs = localDocPaths.filter((p) => !indexedDocPaths.has(p));
    issues.push({
      severity: "ERROR",
      check: "Doc files on disk not in graph (need sync)",
      count: unindexedDocs.length,
      items: unindexedDocs,
    });

    // 5. Isolated docs (no links in or out)
    const isolatedRes = await session.run(`
      MATCH (d:Doc)
      WHERE NOT (d)-[:CONNECTS]->()
        AND NOT (d)-[:TARGETS]->()
        AND NOT ()-[:CONNECTS]->(d)
      RETURN d.path AS p
      ORDER BY p
    `);
    const isolatedDocs = isolatedRes.records.map((r) => r.get("p") as string);
    issues.push({
      severity: "INFO",
      check: "Docs with no links (isolated nodes)",
      count: isolatedDocs.length,
      items: isolatedDocs,
    });

    // 6. Feature/task docs with no test coverage
    const untestedRes = await session.run(`
      MATCH (d:Doc)
      WHERE d.docType IN ['feature', 'task']
        AND NOT (d)-[:HAS_TEST]->()
        AND NOT EXISTS { MATCH (d)-[:TARGETS]->(t:Doc {docType: 'test'}) }
      RETURN d.path AS p, d.docType AS t
      ORDER BY p
    `);
    const untestedDocs = untestedRes.records.map((r) => `[${r.get("t")}] ${r.get("p") as string}`);
    issues.push({
      severity: "INFO",
      check: "Feature/task docs with no test coverage",
      count: untestedDocs.length,
      items: untestedDocs,
    });

    // 7. Code folders with no doc in that scope
    const folderDocRes = await session.run(`
      MATCH (folder:Folder)-[:CONTAINS*1..]->(f:File)
      WHERE f.kind = 'code'
      WITH folder, count(f) AS codeCount
      WHERE codeCount > 0
        AND NOT (folder)<-[:TARGETS]-(:Doc)
        AND NOT ()-[:TARGETS]->(folder)
      RETURN folder.path AS p, codeCount
      ORDER BY codeCount DESC
      LIMIT 50
    `);
    const undocFolders = folderDocRes.records.map((r) => `${r.get("p") as string} (${r.get("codeCount")} code files)`);
    issues.push({
      severity: "INFO",
      check: "Code folders with no doc targeting them (top 50)",
      count: undocFolders.length,
      items: undocFolders,
    });
  } finally {
    await session.close();
  }

  const summary = {
    errors: issues.filter((i) => i.severity === "ERROR").reduce((n, i) => n + i.count, 0),
    warnings: issues.filter((i) => i.severity === "WARN").reduce((n, i) => n + i.count, 0),
    info: issues.filter((i) => i.severity === "INFO").reduce((n, i) => n + i.count, 0),
  };

  const report: ReviewReport = { checks: issues, summary };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\n=== code-kg review ===\n");
  for (const issue of issues) {
    const badge = issue.severity === "ERROR" ? "[ERROR]" : issue.severity === "WARN" ? "[WARN] " : "[INFO] ";
    console.log(`${badge} ${issue.check}: ${issue.count}`);
    if (issue.items.length) {
      const preview = issue.items.slice(0, 20);
      for (const item of preview) console.log(`         ${item}`);
      if (issue.items.length > 20) console.log(`         … and ${issue.items.length - 20} more`);
    }
    console.log();
  }

  console.log(`Summary: ${summary.errors} errors · ${summary.warnings} warnings · ${summary.info} info`);
  if (summary.errors > 0) {
    console.log('Run "code-kg sync" to index any missing files.');
  }
}
