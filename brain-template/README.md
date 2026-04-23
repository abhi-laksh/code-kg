# Project Brain

A knowledge graph documentation system for software projects.
Designed to answer *what exists*, *how it's built*, *what's done*, and *what's pending* — with minimum tokens and zero directory crawling.

---

## Concept

```
Graph (Neo4j)      →  fast traversal, relationships, status queries
Frontmatter        →  node properties, AI reads this without opening body
Body               →  deep content, opened only when needed
```

Every `.md` file is a **node**. Every `[[ns:id]]` link is an **edge**.
The frontmatter `summary` field is what AI tools read during traversal — keep it precise and one sentence.

---

## Folder Structure

```
/
├── README.md                         ← you are here
├── relationships.md                  ← all edge types and link syntax
├── templates/                        ← blank frontmatter for every doc type
│
├── architecture/                     ← system-wide, not feature-scoped
│   ├── overview.md
│   ├── data-flow.md
│   ├── tech-stack.md
│   └── decisions/
│       └── adr-001.md
│
└── features/
    ├── _index.md                     ← master feature registry
    └── auth/                         ← one folder per feature
        ├── _index.md                 ← feature hub node
        ├── flows/
        │   └── login.md
        ├── errors/
        │   └── invalid-token.md
        ├── edge-cases/
        │   └── token-rotation-race.md
        ├── test-cases/
        │   └── login-success.md
        ├── tasks/
        │   ├── _index.md             ← task registry for this feature
        │   └── auth-t-001.md
        ├── fe/
        │   ├── _index.md
        │   ├── pages/
        │   ├── components/
        │   └── state/
        └── be/
            ├── _index.md
            └── auth-service/         ← subfeature (service, controller, etc.)
                ├── _index.md
                ├── generate-token.md ← individual function doc
                └── tasks/            ← subfeature-scoped tasks (optional)
```

---

## Doc Types & Templates

Pick the right template from `/templates/` for every new file.

| Template | Use For |
|---|---|
| `feature-index.md` | Every feature's `_index.md` hub |
| `subfeature-index.md` | `fe/_index.md`, `be/_index.md`, `be/auth-service/_index.md` |
| `task.md` | Any unit of work |
| `flow.md` | User or system flows |
| `error.md` | A specific error condition |
| `edge-case.md` | Known edge cases |
| `test-case.md` | Test scenarios |
| `fe-page.md` | A frontend page/route |
| `fe-component.md` | A UI component |
| `fe-state.md` | A frontend store or state slice |
| `be-function.md` | A documented function or method |
| `architecture.md` | System-wide design docs |
| `adr.md` | Architecture Decision Records |

---

## ID Convention

```
{type-prefix}-{feature}-{number}

feat-auth-000          ← feature hub
task-auth-012          ← task
flow-auth-login-001    ← flow
err-auth-003           ← error
edge-auth-005          ← edge case
test-auth-001          ← test case
page-auth-001          ← FE page
comp-auth-guard-001    ← FE component
state-auth-store-001   ← FE state
sfeat-auth-service-001 ← subfeature
fn-auth-gentoken-001   ← function
adr-003                ← architecture decision
```

---

## Link Syntax

Cross-reference anything with `[[namespace:identifier]]`.

```
[[feature:auth]]                      → auth feature hub
[[feature:auth/be/auth-service]]      → auth-service subfeature
[[code:auth.service.ts]]              → source file node
[[code:generateToken()]]              → function node (parens = function)
[[code:UserSchema]]                   → class/schema node (PascalCase = class)
[[task:auth-t-012]]                   → task by ID
[[flow:auth.login]]                   → named flow
[[arch:decisions/adr-003]]            → ADR
[[error:auth.invalid-token]]          → error doc
[[test:auth.login-success]]           → test case
[[edge:auth.token-race]]              → edge case
```

See `relationships.md` for the full list of namespaces and the Neo4j edges they produce.

---

## Adding a New Feature

```
1. Create  features/{name}/
2. Copy    templates/feature-index.md  →  features/{name}/_index.md
3. Fill    id, name, summary, status, depends_on, used_by
4. Add     features/{name}/ to features/_index.md
5. Create  be/ and fe/ subdirs with subfeature-index.md
6. Add     tasks before starting any work
7. Run     ingestion script to sync with Neo4j
```

---

## AI Query Strategy

AI tools should follow this order — stop as early as the question is answered:

```
1. Query Neo4j          →  status, progress, blocked tasks, relationships
2. Read frontmatter     →  summary, children, depends_on fields
3. Read file body       →  only if frontmatter is insufficient
```

Common queries:

| Question | Where to look |
|---|---|
| What features exist and their status? | `features/_index.md` |
| What tasks are blocked? | Neo4j: `MATCH (t:task {status:"blocked"})` |
| What code does feature X touch? | Traverse `REFERENCES_CODE` edges from feature subgraph |
| How does flow X work? | `features/{name}/flows/x.md` body |
| What depends on component X? | Traverse incoming `USED_BY` edges |
| What's the decision behind X? | Traverse `AFFECTED_BY` → decision node |
