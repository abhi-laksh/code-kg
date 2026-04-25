# Relationships

Defines all relationship (edge) types used in this knowledge graph.
Every `[[link]]` in any doc body or frontmatter value becomes one of these edges in Neo4j.

---

## How Links Resolve

The ingestion parser scans for `[[target]]` patterns. Each target is resolved in order:

| Target format | Resolves to | Example |
|---|---|---|
| Repo-relative file path | Code/file node | `[[src/auth/auth.service.ts]]` |
| Doc `id` field value | Doc node | `[[auth-feature]]` (doc with `id: auth-feature`) |

If neither lookup matches, the link is silently ignored — no edge is created.

> **Code conventions:** use the exact repo-relative path for files · use the exact `id` value from the target doc's frontmatter for doc links

---

## Edge Types (Neo4j)

| Edge | Direction | Meaning |
|---|---|---|
| `DEPENDS_ON` | any → any | Cannot function without the target |
| `USED_BY` | any → feature/component | Target depends on this node |
| `IMPLEMENTS` | task/doc → code node | This work produces that code artifact |
| `REFERENCES_CODE` | any doc → code node | Doc mentions this code artifact |
| `REFERENCES_DOC` | any doc → any doc | Doc links to another doc |
| `BELONGS_TO` | any → feature | Node is scoped to this feature |
| `HAS_TASK` | feature/subfeature → task | Feature owns this task |
| `HAS_FLOW` | feature → flow | Feature owns this flow |
| `HAS_ERROR` | feature → error | Feature owns this error |
| `HAS_EDGE_CASE` | feature → edge-case | Feature owns this edge case |
| `HAS_TEST` | feature/task → test-case | Covered by this test |
| `BLOCKED_BY` | task → task | Task cannot proceed until target is done |
| `SUBTASK_OF` | task → task | Parent-child task relationship |
| `SUPERSEDES` | decision → decision | This ADR replaces another |
| `AFFECTED_BY` | feature/code → decision | Impacted by this architectural decision |

---

## How Edges Are Created

The ingestion script processes each doc in two passes:

1. **Frontmatter fields** — fields like `depends_on`, `blocked_by`, `implements`, `related_test` etc. are scanned for `[[target]]` patterns and resolved into typed edges.
2. **Body text** — all `[[target]]` occurrences in the markdown body are resolved and create `REFERENCES_CODE` or `REFERENCES_DOC` edges depending on whether the target is a file or a doc.

Ownership edges (e.g. `HAS_TASK`, `BELONGS_TO`) are derived from the doc's `parent` or `belongs_to` frontmatter fields, not from body links.
