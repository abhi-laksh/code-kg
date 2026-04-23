# Relationships

Defines all relationship (edge) types used in this knowledge graph.
Every `[[ns:id]]` link in any doc becomes one of these edges in Neo4j.

---

## Link Namespaces

| Syntax | Resolves To | Example |
|---|---|---|
| `[[feature:x]]` | Feature hub or path within a feature | `[[feature:auth]]`, `[[feature:auth/be/auth-service]]` |
| `[[code:x]]` | Source file, function, or class in codebase | `[[code:auth.service.ts]]`, `[[code:generateToken()]]`, `[[code:UserSchema]]` |
| `[[task:id]]` | Task doc by ID | `[[task:auth-t-012]]` |
| `[[flow:x]]` | Flow doc | `[[flow:auth.login]]` |
| `[[arch:x]]` | Architecture doc or ADR | `[[arch:overview]]`, `[[arch:decisions/adr-003]]` |
| `[[error:x]]` | Error doc | `[[error:auth.invalid-token]]` |
| `[[test:x]]` | Test case doc | `[[test:auth.login-success]]` |
| `[[edge:x]]` | Edge case doc | `[[edge:auth.token-race]]` |

> **Code conventions:** `file.ts` for files · `fnName()` for functions (parens required) · `ClassName` for classes/schemas (PascalCase, no parens)

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

The ingestion script scans every doc's body for `[[ns:id]]` patterns and creates edges automatically. Frontmatter fields like `depends_on`, `blocked_by`, `implements` etc. are also resolved into typed edges.

Ownership (e.g. `HAS_TASK` vs `REFERENCES_DOC`) is determined by whether the linked node's `parent` or `belongs_to` points back to the same feature as the source doc.
