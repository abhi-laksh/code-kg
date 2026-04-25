import { Session } from "neo4j-driver";
import { FileInfo, SymbolInfo, ImportEdge, CallEdge, SymbolEdge, ReExportsEdge, ImportTypeEdge, DocInfo, PlanItem, Decision, Constraint, GraphCounts } from "../types.js";
import { toInt, unwrapRecord } from "./driver.js";
import { resolveImport } from "./parser.js";

// ── schema + project root ─────────────────────────────────────────────────────

export async function ensureSchema(session: Session): Promise<void> {
  const stmts = [
    `CREATE CONSTRAINT IF NOT EXISTS FOR (p:Project)       REQUIRE p.name                   IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (d:Folder)        REQUIRE d.path                   IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (f:File)          REQUIRE f.path                   IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (e:ExternalModule) REQUIRE e.name                  IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (s:Symbol)        REQUIRE (s.file, s.name, s.startLine) IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (d:Doc)           REQUIRE d.path                   IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (p:PlanItem)      REQUIRE (p.doc, p.index)         IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (d:Decision)      REQUIRE (d.doc, d.index)         IS UNIQUE`,
    `CREATE CONSTRAINT IF NOT EXISTS FOR (c:Constraint)    REQUIRE (c.doc, c.index)         IS UNIQUE`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Doc) ON (d.id)`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Doc) ON (d.name)`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Doc) ON (d.docType)`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Doc) ON (d.status)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.name)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.kind)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.isExported)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.returnType)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.async)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.visibility)`,
    `CREATE INDEX IF NOT EXISTS FOR (s:Symbol) ON (s.parentName)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:File) ON (f.name)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:File) ON (f.kind)`,
    `CREATE INDEX IF NOT EXISTS FOR (f:File) ON (f.planned)`,
    `CREATE INDEX IF NOT EXISTS FOR (d:Doc) ON (d.scope)`,
    `CREATE FULLTEXT INDEX doc_fulltext IF NOT EXISTS FOR (n:Doc) ON EACH [n.title, n.name, n.summary, n.keywords]`,
    `CREATE FULLTEXT INDEX symbol_fulltext IF NOT EXISTS FOR (n:Symbol) ON EACH [n.name, n.jsdoc, n.signature]`,
  ];
  for (const s of stmts) await session.run(s);
}

export async function ensureProjectRoot(session: Session, project: string, root: string): Promise<void> {
  await session.run(
    `MERGE (p:Project {name: $name}) SET p.root = $root
     MERGE (d:Folder {path: "."}) SET d.name = $name
     MERGE (p)-[:CONTAINS]->(d)`,
    { name: project, root },
  );
}

// ── folders ───────────────────────────────────────────────────────────────────

export async function writeFolders(session: Session, folderPaths: string[], project: string): Promise<void> {
  if (!folderPaths.length) return;
  await session.run(
    `UNWIND $folders AS fp
     MERGE (d:Folder {path: fp})
     SET d.name = CASE WHEN fp = "." THEN $proj ELSE last(split(fp, "/")) END`,
    { folders: folderPaths, proj: project },
  );
  await session.run(
    `UNWIND $folders AS fp
     WITH fp WHERE fp <> "."
     WITH fp,
          CASE WHEN fp CONTAINS "/"
               THEN substring(fp, 0, size(fp) - size(last(split(fp, "/"))) - 1)
               ELSE "." END AS parent
     MATCH (a:Folder {path: parent})
     MATCH (b:Folder {path: fp})
     MERGE (a)-[:CONTAINS]->(b)`,
    { folders: folderPaths },
  );
}

// ── files ─────────────────────────────────────────────────────────────────────

export async function writeFiles(session: Session, files: FileInfo[]): Promise<void> {
  if (!files.length) return;
  await session.run(
    `UNWIND $files AS f
     MERGE (file:File {path: f.path})
     SET file.name        = f.name,
         file.ext         = f.ext,
         file.language    = f.language,
         file.kind        = f.kind,
         file.isEntryPoint = f.isEntryPoint,
         file.isGenerated = f.isGenerated,
         file.isTest      = f.isTest,
         file.lineCount   = f.lineCount,
         file.external    = false,
         file.planned     = null
     WITH file, f,
          CASE WHEN f.path CONTAINS "/"
               THEN substring(f.path, 0, size(f.path) - size(f.name) - 1)
               ELSE "." END AS folder
     MERGE (d:Folder {path: folder})
     MERGE (d)-[:CONTAINS]->(file)`,
    {
      files: files.map((f) => ({
        path: f.path, name: f.name, ext: f.ext, language: f.language, kind: f.kind,
        isEntryPoint: !!f.isEntryPoint, isGenerated: !!f.isGenerated, isTest: !!f.isTest,
        lineCount: toInt(f.lineCount),
      })),
    },
  );
}

// ── symbols ───────────────────────────────────────────────────────────────────

export async function writeSymbols(session: Session, symbols: SymbolInfo[]): Promise<void> {
  if (!symbols.length) return;
  await session.run(
    `UNWIND $symbols AS s
     MERGE (sym:Symbol {file: s.file, name: s.name, startLine: s.startLine})
     SET sym.kind          = s.kind,
         sym.endLine        = s.endLine,
         sym.signature      = s.signature,
         sym.isExported     = s.isExported,
         sym.parentName     = s.parentName,
         sym.jsdoc          = s.jsdoc,
         sym.async          = s.async,
         sym.abstract       = s.abstract,
         sym.static         = s.static,
         sym.visibility     = s.visibility,
         sym.returnType     = s.returnType,
         sym.parameters     = s.parameters,
         sym.genericParams  = s.genericParams,
         sym.decoratorNames = s.decoratorNames
     MERGE (f:File {path: s.file})
     MERGE (f)-[:DEFINES]->(sym)`,
    {
      symbols: symbols.map((s) => ({
        file: s.file, name: s.name, kind: s.kind,
        startLine: toInt(s.startLine), endLine: toInt(s.endLine),
        signature: s.signature, isExported: !!s.isExported,
        parentName: s.parentName ?? null,
        jsdoc: s.jsdoc ?? null,
        async: s.async ?? null,
        abstract: s.abstract ?? null,
        static: s.static ?? null,
        visibility: s.visibility ?? null,
        returnType: s.returnType ?? null,
        parameters: s.parameters ?? null,
        genericParams: s.genericParams ?? null,
        decoratorNames: s.decoratorNames ?? null,
      })),
    },
  );
}

// ── imports ───────────────────────────────────────────────────────────────────

export async function writeImports(session: Session, rawImports: ImportEdge[]): Promise<void> {
  if (!rawImports.length) return;
  const resolved = rawImports.map((i) => {
    const { target, external } = resolveImport(i.from, i.to);
    return { from: i.from, to: target, external };
  });
  await session.run(
    `UNWIND $imports AS i
     MERGE (a:File {path: i.from})
     FOREACH (_ IN CASE WHEN i.external     THEN [1] ELSE [] END |
       MERGE (b:ExternalModule {name: i.to})
       MERGE (a)-[r:IMPORTS]->(b) SET r.external = true
     )
     FOREACH (_ IN CASE WHEN NOT i.external THEN [1] ELSE [] END |
       MERGE (b:File {path: i.to}) ON CREATE SET b.external = false
       MERGE (a)-[r:IMPORTS]->(b) SET r.external = false
     )`,
    { imports: resolved },
  );
}

// ── calls ─────────────────────────────────────────────────────────────────────

export async function writeCalls(session: Session, calls: CallEdge[]): Promise<void> {
  if (!calls.length) return;
  await session.run(
    `UNWIND $calls AS c
     MATCH (a:Symbol {file: c.from.file, name: c.from.name, startLine: c.from.startLine})
     MATCH (b:Symbol {file: c.to.file,   name: c.to.name,   startLine: c.to.startLine})
     MERGE (a)-[:CALLS]->(b)`,
    {
      calls: calls.map((c) => ({
        from: { ...c.from, startLine: toInt(c.from.startLine) },
        to:   { ...c.to,   startLine: toInt(c.to.startLine) },
      })),
    },
  );
}

// ── symbol → symbol edges ─────────────────────────────────────────────────────

function mapSymbolEdges(edges: SymbolEdge[]) {
  return edges.map((e) => ({
    from: { ...e.from, startLine: toInt(e.from.startLine) },
    to:   { ...e.to,   startLine: toInt(e.to.startLine) },
  }));
}

async function writeSymbolEdges(session: Session, edges: SymbolEdge[], rel: string): Promise<void> {
  if (!edges.length) return;
  await session.run(
    `UNWIND $edges AS e
     MATCH (a:Symbol {file: e.from.file, name: e.from.name, startLine: e.from.startLine})
     MATCH (b:Symbol {file: e.to.file,   name: e.to.name,   startLine: e.to.startLine})
     MERGE (a)-[:${rel}]->(b)`,
    { edges: mapSymbolEdges(edges) },
  );
}

export const writeExtends        = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "EXTENDS");
export const writeImplements     = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "IMPLEMENTS");
export const writeOverrides      = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "OVERRIDES");
export const writeDecoratedBy    = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "DECORATED_BY");
export const writeThrows         = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "THROWS");
export const writeReferencesType = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "REFERENCES_TYPE");
export const writeInstantiates   = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "INSTANTIATES");
export const writeUnionOf        = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "UNION_OF");
export const writeIntersectionOf = (s: Session, e: SymbolEdge[]) => writeSymbolEdges(s, e, "INTERSECTION_OF");

export async function writeReExports(session: Session, edges: ReExportsEdge[]): Promise<void> {
  if (!edges.length) return;
  await session.run(
    `UNWIND $edges AS e
     MATCH (f:File {path: e.file})
     MATCH (s:Symbol {file: e.symbol.file, name: e.symbol.name, startLine: e.symbol.startLine})
     MERGE (f)-[:RE_EXPORTS]->(s)`,
    { edges: edges.map((e) => ({ file: e.file, symbol: { ...e.symbol, startLine: toInt(e.symbol.startLine) } })) },
  );
}

export async function writeImportTypes(session: Session, rawImports: ImportTypeEdge[]): Promise<void> {
  if (!rawImports.length) return;
  const resolved = rawImports.map((i) => {
    const { target, external } = resolveImport(i.from, i.to);
    return { from: i.from, to: target, external };
  });
  await session.run(
    `UNWIND $imports AS i
     MERGE (a:File {path: i.from})
     FOREACH (_ IN CASE WHEN i.external     THEN [1] ELSE [] END |
       MERGE (b:ExternalModule {name: i.to})
       MERGE (a)-[:IMPORTS_TYPE]->(b)
     )
     FOREACH (_ IN CASE WHEN NOT i.external THEN [1] ELSE [] END |
       MERGE (b:File {path: i.to}) ON CREATE SET b.external = false
       MERGE (a)-[:IMPORTS_TYPE]->(b)
     )`,
    { imports: resolved },
  );
}

// ── docs ──────────────────────────────────────────────────────────────────────

export async function writeDocs(session: Session, docs: DocInfo[]): Promise<void> {
  if (!docs.length) return;
  await session.run(
    `UNWIND $docs AS d
     MERGE (doc:Doc {path: d.path})
     SET doc.title       = d.title,
         doc.summary     = d.summary,
         doc.scope       = d.scope,
         doc.targetPaths = d.targetPaths,
         doc.id          = d.id,
         doc.docType     = d.docType,
         doc.name        = d.name,
         doc.status      = d.status,
         doc.tags        = d.tags,
         doc.keywords    = d.keywords,
         doc.updated     = d.updated,
         doc.meta        = d.meta
     WITH doc, d
     UNWIND d.targetPaths AS tp
     MATCH (t) WHERE (t:File OR t:Folder) AND t.path = tp
     MERGE (doc)-[:TARGETS]->(t)
     WITH doc, d
     UNWIND CASE WHEN d.plannedPaths IS NULL THEN [] ELSE d.plannedPaths END AS pp
     MERGE (pf:File {path: pp}) ON CREATE SET pf.planned = true
     MERGE (doc)-[:TARGETS]->(pf)`,
    {
      docs: docs.map((d) => ({
        ...d,
        meta: d.meta != null ? JSON.stringify(d.meta) : null,
      })),
    },
  );
}

export async function writeDocLinks(session: Session, docs: DocInfo[]): Promise<void> {
  const withLinks = docs.filter((d) => d.docLinks.length > 0);
  if (!withLinks.length) return;
  await session.run(
    `UNWIND $docs AS d
     MATCH (src:Doc {path: d.path})
     UNWIND d.docLinks AS lp
     MATCH (dst:Doc {path: lp})
     MERGE (src)-[:CONNECTS]->(dst)`,
    { docs: withLinks.map((d) => ({ path: d.path, docLinks: d.docLinks })) },
  );
}

export async function writePlanItems(session: Session, items: PlanItem[]): Promise<void> {
  if (!items.length) return;
  await session.run(
    `UNWIND $items AS p
     MERGE (pi:PlanItem {doc: p.doc, index: p.index})
     SET pi.title = p.title, pi.status = p.status, pi.scope = p.scope
     MERGE (d:Doc {path: p.doc})
     MERGE (pi)-[:PART_OF]->(d)
     WITH pi, p
     UNWIND p.targetPaths AS tp
     MATCH (t) WHERE (t:File OR t:Folder) AND t.path = tp
     MERGE (pi)-[:TARGETS]->(t)`,
    { items: items.map((p) => ({ ...p, index: toInt(p.index) })) },
  );
}

export async function writeDecisions(session: Session, items: Decision[]): Promise<void> {
  if (!items.length) return;
  await session.run(
    `UNWIND $items AS x
     MERGE (dec:Decision {doc: x.doc, index: x.index})
     SET dec.title = x.title, dec.reason = x.reason, dec.scope = x.scope
     MERGE (d:Doc {path: x.doc})
     MERGE (dec)-[:PART_OF]->(d)
     WITH dec, x
     UNWIND x.targetPaths AS tp
     MATCH (t) WHERE (t:File OR t:Folder) AND t.path = tp
     MERGE (dec)-[:TARGETS]->(t)`,
    { items: items.map((d) => ({ ...d, index: toInt(d.index) })) },
  );
}

export async function writeConstraints(session: Session, items: Constraint[]): Promise<void> {
  if (!items.length) return;
  await session.run(
    `UNWIND $items AS x
     MERGE (c:Constraint {doc: x.doc, index: x.index})
     SET c.text = x.text, c.severity = x.severity, c.scope = x.scope
     MERGE (d:Doc {path: x.doc})
     MERGE (c)-[:PART_OF]->(d)
     WITH c, x
     UNWIND x.targetPaths AS tp
     MATCH (t) WHERE (t:File OR t:Folder) AND t.path = tp
     MERGE (c)-[:TARGETS]->(t)`,
    { items: items.map((c) => ({ ...c, index: toInt(c.index) })) },
  );
}

// ── delete helpers (incremental) ──────────────────────────────────────────────

export async function deleteFile(session: Session, p: string): Promise<void> {
  await session.run(`MATCH (f:File {path:$p})-[:DEFINES]->(s:Symbol) DETACH DELETE s`, { p });
  await session.run(`MATCH (f:File {path:$p}) DETACH DELETE f`, { p });
}

export async function deleteSymbolsFor(session: Session, p: string): Promise<void> {
  await session.run(`MATCH (f:File {path:$p})-[:DEFINES]->(s:Symbol) DETACH DELETE s`, { p });
}

export async function deleteImportsFor(session: Session, p: string): Promise<void> {
  await session.run(`MATCH (:File {path:$p})-[r:IMPORTS|IMPORTS_TYPE|RE_EXPORTS]->() DELETE r`, { p });
}

export async function deleteCallsTouching(session: Session, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await session.run(
    `UNWIND $paths AS p
     MATCH (a:Symbol)-[r:CALLS]->(b:Symbol)
     WHERE a.file = p OR b.file = p DELETE r`,
    { paths },
  );
}

export async function deleteDoc(session: Session, p: string): Promise<void> {
  await session.run(`MATCH (d:Doc {path:$p})<-[:PART_OF]-(x) DETACH DELETE x`, { p });
  await session.run(`MATCH (d:Doc {path:$p}) DETACH DELETE d`, { p });
}

export async function gcEmptyFolders(session: Session): Promise<void> {
  // Loop until stable — single pass misses parent folders whose only child was just deleted.
  let deleted = 1;
  while (deleted > 0) {
    const res = await session.run(
      `MATCH (d:Folder) WHERE d.path <> "." AND NOT (d)-[:CONTAINS]->() DETACH DELETE d`,
    );
    deleted = res.summary.counters.updates().nodesDeleted;
  }
}

export async function gcOrphanFiles(session: Session): Promise<void> {
  // Delete stub File nodes (created by writeImports for unresolved imports) but NOT planned
  // nodes (created by writeDocs for future/planned code artifacts).
  await session.run(
    `MATCH (f:File) WHERE NOT ()-[:CONTAINS]->(f) AND f.planned IS NULL DETACH DELETE f`,
  );
}

// ── counts ────────────────────────────────────────────────────────────────────

export async function collectCounts(session: Session): Promise<GraphCounts> {
  const res = await session.run(`
    CALL () { MATCH (n:Project)       RETURN count(n) AS c } WITH c AS pc
    CALL () { MATCH (n:Folder)        RETURN count(n) AS c } WITH pc, c AS fc
    CALL () { MATCH (n:File)          RETURN count(n) AS c } WITH pc, fc, c AS fic
    CALL () { MATCH (n:ExternalModule) RETURN count(n) AS c } WITH pc, fc, fic, c AS emc
    CALL () { MATCH (n:Symbol)        RETURN count(n) AS c } WITH pc, fc, fic, emc, c AS sc
    CALL () { MATCH (n:Doc)           RETURN count(n) AS c } WITH pc, fc, fic, emc, sc, c AS dc
    CALL () { MATCH (n:PlanItem)      RETURN count(n) AS c } WITH pc, fc, fic, emc, sc, dc, c AS pic
    CALL () { MATCH (n:Decision)      RETURN count(n) AS c } WITH pc, fc, fic, emc, sc, dc, pic, c AS dec
    CALL () { MATCH (n:Constraint)    RETURN count(n) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, c AS cc
    CALL () { MATCH ()-[r:IMPORTS]->()          RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, c AS ic
    CALL () { MATCH ()-[r:IMPORTS_TYPE]->()     RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, c AS itc
    CALL () { MATCH ()-[r:CALLS]->()            RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, c AS cac
    CALL () { MATCH ()-[r:CONNECTS]->()         RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, c AS conc
    CALL () { MATCH ()-[r:EXTENDS]->()          RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, c AS exc
    CALL () { MATCH ()-[r:IMPLEMENTS]->()       RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, c AS imc
    CALL () { MATCH ()-[r:OVERRIDES]->()        RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, c AS ovc
    CALL () { MATCH ()-[r:DECORATED_BY]->()     RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, c AS dbc
    CALL () { MATCH ()-[r:THROWS]->()           RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, c AS thc
    CALL () { MATCH ()-[r:REFERENCES_TYPE]->()  RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, thc, c AS rtc
    CALL () { MATCH ()-[r:INSTANTIATES]->()     RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, thc, rtc, c AS inc
    CALL () { MATCH ()-[r:UNION_OF]->()         RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, thc, rtc, inc, c AS uoc
    CALL () { MATCH ()-[r:INTERSECTION_OF]->()  RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, thc, rtc, inc, uoc, c AS ioc
    CALL () { MATCH ()-[r:RE_EXPORTS]->()       RETURN count(r) AS c } WITH pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, thc, rtc, inc, uoc, ioc, c AS rec
    RETURN pc, fc, fic, emc, sc, dc, pic, dec, cc, ic, itc, cac, conc, exc, imc, ovc, dbc, thc, rtc, inc, uoc, ioc, rec
  `);
  const r = unwrapRecord(res.records[0]);
  return {
    Project: r.pc as number, Folder: r.fc as number, File: r.fic as number,
    ExternalModule: r.emc as number, Symbol: r.sc as number, Doc: r.dc as number,
    PlanItem: r.pic as number, Decision: r.dec as number, Constraint: r.cc as number,
    IMPORTS: r.ic as number, IMPORTS_TYPE: r.itc as number,
    CALLS: r.cac as number, CONNECTS: r.conc as number,
    EXTENDS: r.exc as number, IMPLEMENTS: r.imc as number, OVERRIDES: r.ovc as number,
    DECORATED_BY: r.dbc as number, THROWS: r.thc as number,
    REFERENCES_TYPE: r.rtc as number, INSTANTIATES: r.inc as number,
    UNION_OF: r.uoc as number, INTERSECTION_OF: r.ioc as number, RE_EXPORTS: r.rec as number,
  };
}

export function diffCounts(before: GraphCounts, after: GraphCounts): Partial<GraphCounts> {
  const delta: Partial<GraphCounts> = {};
  for (const k of Object.keys(after) as (keyof GraphCounts)[]) {
    delta[k] = (after[k] ?? 0) - (before[k] ?? 0);
  }
  return delta;
}
