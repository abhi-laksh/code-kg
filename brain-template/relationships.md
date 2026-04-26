# Relationships

How `[[links]]` in docs become edges, and what the full graph looks like.

---

## Link Syntax

```
[[target]]
```

`target` is a **repo-relative file path** or a **doc `id`** (frontmatter `id` field).

| Target | Resolves to | Edge |
|---|---|---|
| `[[src/auth/auth.service.ts]]` | Existing `File` node | `(Doc)-[:TARGETS]->(File)` |
| `[[auth-feature]]` | Doc with `id: auth-feature` | `(Doc)-[:CONNECTS]->(Doc)` |
| `[[src/planned/new.ts]]` | File not on disk yet | `(File {planned:true})` + `TARGETS` |

Works in body text and in any frontmatter field value. Field names are ignored — only the `[[target]]` inside matters.

---

## Doc-Produced Edges

These are the only edges that doc parsing creates:

| Edge | From → To | How |
|---|---|---|
| `TARGETS` | Doc → File / Folder | `[[src/path/file.ts]]` in body or frontmatter |
| `TARGETS` | Doc → File `{planned:true}` | `[[src/path/file.ts]]` — file doesn't exist yet |
| `CONNECTS` | Doc → Doc | `[[doc-id]]` matches another doc's `id` field |
| `PART_OF` | PlanItem / Decision / Constraint → Doc | Auto — from `- [ ]` checkboxes in body |

---

## Code-Produced Edges

These come from source file parsing (ts-morph) — not from `[[links]]`:

| Edge | From → To | Source |
|---|---|---|
| `DEFINES` | File → Symbol | Every named function, class, method, type, etc. |
| `IMPORTS` | File → File / ExternalModule | `import` statements |
| `IMPORTS_TYPE` | File → File / ExternalModule | `import type` statements |
| `RE_EXPORTS` | File → Symbol | `export { X } from` / `export * from` |
| `CALLS` | Symbol → Symbol | Function / method call expressions |
| `INSTANTIATES` | Symbol → Symbol | `new ClassName()` expressions |
| `EXTENDS` | Symbol → Symbol | Class / interface inheritance |
| `IMPLEMENTS` | Symbol → Symbol | Class implements interface |
| `OVERRIDES` | Symbol → Symbol | Method overrides parent class method |
| `DECORATED_BY` | Symbol → Symbol | Decorator applied to class or method |
| `THROWS` | Symbol → Symbol | `throw new ErrorClass()` or re-throws |
| `REFERENCES_TYPE` | Symbol → Symbol | Parameter types and return type only |
| `UNION_OF` | Symbol → Symbol | Union type alias members |
| `INTERSECTION_OF` | Symbol → Symbol | Intersection type alias members |

---

## Full Node List

| Label | Unique Key | Key Properties |
|---|---|---|
| `Project` | `name` | `root` |
| `Folder` | `path` | `name` |
| `File` | `path` | `name`, `ext`, `kind`, `planned`, `lineCount` |
| `ExternalModule` | `name` | — |
| `Symbol` | `(file, name, startLine)` | `kind`, `signature`, `jsdoc`, `async`, `abstract`, `static`, `visibility`, `returnType`, `parameters`, `parameterTypes`, `genericParams`, `decoratorNames`, `parentName`, `isExported` |
| `Doc` | `path` | `id`, `type`, `name`, `status`, `summary`, `scope`, `tags`, `keywords` |
| `PlanItem` | `(doc, index)` | `title`, `status` (`todo`/`done`) |
| `Decision` | `(doc, index)` | `title`, `reason` |
| `Constraint` | `(doc, index)` | `text`, `severity` (`must`/`should`/`nice`) |

---

## Structural Edges

| Edge | From → To |
|---|---|
| `CONTAINS` | Project / Folder → Folder / File |
