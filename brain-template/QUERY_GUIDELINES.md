# Neo4j Query Guidelines

Rules for writing fast, correct queries against this knowledge graph.

---

## Node Labels & Entry Points

Always start with the most selective label + indexed property.

```cypher
// GOOD — hits index on Symbol.name
MATCH (s:Symbol {name: 'parseUser'}) RETURN s

// BAD — full scan, no label
MATCH (n {name: 'parseUser'}) RETURN n
```

---

## Indexed Properties (use these in WHERE / MATCH)

**Symbol** — `name`, `kind`, `isExported`, `returnType`, `async`, `visibility`, `parentName`
**File** — `path`, `name`, `kind`, `planned`
**Doc** — `path`, `id`, `name`, `docType`, `status`, `scope`
**Fulltext** — `doc_fulltext` (Doc: title, name, summary, keywords), `symbol_fulltext` (Symbol: name, jsdoc, signature)

---

## Traversal Direction

Relationships are directional. Always traverse the correct way.

```cypher
// GOOD — File DEFINES Symbol (correct direction)
MATCH (f:File)-[:DEFINES]->(s:Symbol) RETURN f.path, s.name

// BAD — reversed, returns nothing
MATCH (s:Symbol)-[:DEFINES]->(f:File) RETURN s.name
```

Reference:
- `(File)-[:DEFINES]->(Symbol)`
- `(Symbol)-[:CALLS]->(Symbol)`
- `(Symbol)-[:EXTENDS]->(Symbol)`
- `(Symbol)-[:IMPLEMENTS]->(Symbol)`
- `(Doc)-[:TARGETS]->(File|Folder)`
- `(Doc)-[:CONNECTS]->(Doc)`
- `(PlanItem|Decision|Constraint)-[:PART_OF]->(Doc)`
- `(Folder)-[:CONTAINS]->(Folder|File)`

---

## Fulltext Search

Use `CALL db.index.fulltext.queryNodes` for fuzzy/keyword search.

```cypher
// GOOD — fulltext for keyword search (example: finding auth-related docs)
CALL db.index.fulltext.queryNodes('doc_fulltext', 'authentication')
YIELD node, score
RETURN node.path, node.title, score
ORDER BY score DESC LIMIT 10

// BAD — regex scan on every node
MATCH (d:Doc) WHERE d.summary =~ '.*auth.*' RETURN d.path
```

---

## Collecting vs Filtering

Use `collect()` over multiple rows, not repeated queries.

```cypher
// GOOD — one query, grouped result (example: class with its methods)
MATCH (s:Symbol {kind: 'class'})-[:DEFINES|PART_OF*0..1]-(m:Symbol {kind: 'method'})
WHERE s.file = 'src/user/user.service.ts'
RETURN s.name, collect(m.name) AS methods

// BAD — N+1: one query per class to get methods
```

---

## Limiting Traversal Depth

Cap variable-length paths. Unbounded `*` destroys performance on large graphs.

```cypher
// GOOD — bounded depth (example: inheritance chain up to 5 levels)
MATCH path = (c:Symbol {name: 'AdminService'})-[:EXTENDS*1..5]->(base:Symbol)
RETURN [n IN nodes(path) | n.name] AS chain

// BAD — unbounded, will traverse entire graph
MATCH (c:Symbol)-[:EXTENDS*]->(base:Symbol) RETURN c.name, base.name
```

---

## Optional Relationships

Use `OPTIONAL MATCH` when an edge may not exist. Regular `MATCH` silently drops rows.

```cypher
// GOOD — keeps the symbol row even if no doc targets it
MATCH (s:Symbol {kind: 'class'})
OPTIONAL MATCH (d:Doc)-[:TARGETS]->(f:File)-[:DEFINES]->(s)
RETURN s.name, d.title

// BAD — drops all classes with no doc (looks like correct output, hides missing docs)
MATCH (s:Symbol {kind: 'class'})
MATCH (d:Doc)-[:TARGETS]->(f:File)-[:DEFINES]->(s)
RETURN s.name, d.title
```

---

## Existence Check vs Fetching

Use `EXISTS {}` to check presence without pulling data.

```cypher
// GOOD — check if a symbol is documented (example: undocumented exports)
MATCH (s:Symbol {isExported: true})
WHERE NOT EXISTS { MATCH (d:Doc)-[:TARGETS]->(:File {path: s.file}) }
RETURN s.name, s.file

// BAD — returns all doc rows just to check existence
MATCH (s:Symbol {isExported: true})
OPTIONAL MATCH (d:Doc)-[:TARGETS]->(:File {path: s.file})
WHERE d IS NULL
RETURN s.name
```

---

## Anti-Patterns

| Pattern | Problem |
|---|---|
| `MATCH (n) WHERE n.x = ...` | Full scan — always add label |
| `MATCH ()-[r]->()` | Scans all relationships — add node labels |
| `WHERE n.name =~ '.*foo.*'` | Regex on every node — use fulltext index |
| `MATCH p = (a)-[*]->(b)` | Unbounded traversal — always set max depth |
| Multiple `MATCH` for same pattern | Use `OPTIONAL MATCH` or `collect()` |
| `RETURN *` on large traversals | Pulls entire subgraph — project only needed fields |
