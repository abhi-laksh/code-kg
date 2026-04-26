# Project Brain

Knowledge graph documentation for this codebase.
Every `.md` file is a node. Every `[[link]]` is an edge. Neo4j holds the graph.

---

## How It Works

```
Source files  →  parsed by ts-morph  →  Symbols, Calls, Imports, Types in Neo4j
Docs (.md)    →  parsed by code-kg   →  Doc nodes, TARGETS/CONNECTS edges in Neo4j
[[links]]     →  become graph edges  →  connect docs to code, other docs, planned files
```

**Frontmatter `summary`** — what AI reads during graph traversal. Keep it one sentence, precise.
**Body** — opened only when frontmatter isn't enough.

---

## Doc Types

| Type | Use for | Command |
|---|---|---|
| `architecture` | Full system — stack, infra, cloud, APIs, decisions | `code-kg new architecture <path>` |
| `app` | A service or application | `code-kg new app <path>` |
| `feature` | A product feature or sub-feature | `code-kg new feature <path>` |
| `task` | A unit of work — task, subtask, migration, refactor | `code-kg new task <path>` |
| `code` | A function, service, component, schema | `code-kg new code <path>` |
| `test` | A test suite or scenario | `code-kg new test <path>` |
| `edge-case` | A specific edge case and how it's handled | `code-kg new edge-case <path>` |
| `tool` | A library, SDK, CLI, or external service | `code-kg new tool <path>` |

---

## Link Syntax

One format. Two targets.

```
[[src/path/to/file.ts]]     → links to a code file (creates TARGETS edge)
[[some-doc-id]]             → links to a doc by its frontmatter id (creates CONNECTS edge)
```

**File doesn't exist yet?** — a `File {planned: true}` node is created. When the file is eventually created and synced, it upgrades to a real node automatically.

Links work anywhere — body text, frontmatter field values, checkboxes.

```markdown
The auth flow lives in [[src/auth/auth.service.ts]].
Depends on [[tool-prisma]] and [[arch-database]].
Will be implemented in [[src/payments/stripe.service.ts]].   ← planned node
```

---

## ID Convention

Set the `id` field in frontmatter. No strict format — just be consistent.

```
arch-database          ← architecture doc
app-backend            ← app doc
feature-auth           ← feature
feature-auth-oauth     ← sub-feature
task-auth-001          ← task
code-auth-service      ← code doc
test-auth-login        ← test
edge-token-expiry      ← edge case
tool-prisma            ← tool
```

---

## CLI

```sh
code-kg init                    # configure Neo4j connection
code-kg init-templates          # scaffold templates interactively
code-kg add-guidelines          # copy query guidelines to project root

code-kg new <type> <path>       # create a doc from template
code-kg sync                    # sync changed files to graph (auto-detects via git)
code-kg sync <paths...>         # sync specific files
code-kg watch                   # watch for changes and sync automatically
code-kg rebuild                 # wipe and re-index everything from scratch

code-kg review                  # find coverage gaps — unindexed files, undocumented code
code-kg review --json           # machine-readable output
code-kg ping                    # verify Neo4j connection and show graph stats
```

---

## Graph — What's Indexed

**From source code (automatic):**
- Every function, class, method, interface, type, enum, property → `Symbol` node
- Calls, imports, inheritance, decorators, throws, type references → edges
- Symbols carry: signature, jsdoc, parameters, return type, visibility, async/abstract flags

**From docs (from `[[links]]` and frontmatter):**
- Every `.md` file → `Doc` node
- Checkboxes → `PlanItem` nodes
- `[[file-path]]` → `TARGETS` edge to `File`
- `[[doc-id]]` → `CONNECTS` edge to `Doc`

---

## AI Query Strategy

Stop as early as the question is answered:

```
1. Graph query   →  relationships, status, what calls what, what's undocumented
2. Doc nodes     →  summary, metadata, linked files
3. File body     →  only when graph + frontmatter isn't enough
```

Example queries:

```cypher
// All async functions that throw
MATCH (s:Symbol {async: true})-[:THROWS]->(e:Symbol)
RETURN s.name, s.file, e.name

// Planned files not yet created
MATCH (d:Doc)-[:TARGETS]->(f:File {planned: true})
RETURN d.path, f.path

// Exported symbols with no doc
MATCH (s:Symbol {isExported: true})
WHERE NOT ()-[:TARGETS]->(:File {path: s.file})
RETURN s.name, s.file

// All classes implementing an interface
MATCH (c:Symbol {kind: 'class'})-[:IMPLEMENTS]->(i:Symbol {name: 'IUserRepository'})
RETURN c.name, c.file
```

See `QUERY_GUIDELINES.md` for best practices and anti-patterns.
