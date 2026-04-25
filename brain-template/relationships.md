# Relationships

How `[[links]]` in your docs become edges in the knowledge graph.

---

## Syntax

One format only:

```
[[target]]
```

`target` is either a **repo-relative file path** or a **doc `id`**.

---

## How It Resolves

| Target | Resolves to | Edge created |
|---|---|---|
| `[[src/auth/auth.service.ts]]` | File node (exists on disk) | `(Doc)-[:TARGETS]->(File)` |
| `[[auth-feature]]` | Doc with `id: auth-feature` in frontmatter | `(Doc)-[:CONNECTS]->(Doc)` |
| `[[src/planned/new-service.ts]]` | File not yet on disk | `(File {planned: true})` + `TARGETS` |

> If the target doesn't look like a file path and doesn't match any doc `id` — link is dropped.

---

## What Gets Created in Neo4j

These are the **only** edges docs produce:

| Edge | From → To | When |
|---|---|---|
| `TARGETS` | Doc → File or Folder | `[[path/to/file.ts]]` resolves to existing file |
| `TARGETS` | Doc → File `{planned: true}` | `[[path/to/file.ts]]` doesn't exist yet |
| `CONNECTS` | Doc → Doc | `[[doc-id]]` matches another doc's `id` field |
| `PART_OF` | PlanItem / Decision / Constraint → Doc | Auto — from checkbox lists and section headings |

Code-level edges (`CALLS`, `EXTENDS`, `IMPLEMENTS`, etc.) come from source file parsing — not from doc links.

---

## Examples

```markdown
<!-- links to an existing file -->
See [[src/auth/auth.service.ts]] for implementation.

<!-- links to a planned file that doesn't exist yet -->
Will be implemented in [[src/payments/stripe.service.ts]].

<!-- links to another doc by its frontmatter id -->
Depends on [[auth-feature]].
```

---

## Frontmatter Links

Any frontmatter field value is also scanned for `[[target]]` patterns:

```yaml
depends_on: [[src/db/connection.ts]]
related: [[user-feature]]
```

Same resolution rules apply — field names are ignored, only the `[[target]]` inside matters.
