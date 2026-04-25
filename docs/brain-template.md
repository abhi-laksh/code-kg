# Brain Template Guide

## Purpose

The bundled `brain-template` provides a markdown structure for documenting apps, features, tasks, code entities, tests, tools, and architecture decisions in a graph-friendly way. Docs cross-link each other and codebase files using `[[wikilinks]]`.

## Core Model

Each markdown file is a graph node.

- Frontmatter — machine-readable metadata (id, type, status, links)
- Body sections — human-readable detail tailored to the doc type
- `[[namespace:id]]` links become graph edges

## Template Files

| Template | Used for |
|----------|----------|
| `feature.md` | Features and subfeatures — problem, scope, plan, risks |
| `task.md` | Tasks, subtasks, migrations, refactors — what, plan, files, checklist |
| `code.md` | Functions, components, hooks, services, modules, APIs, schemas |
| `test.md` | Unit, integration, e2e, and manual test cases |
| `app.md` | Application or service overview — architecture, flows, integrations |
| `architecture.md` | Architecture decisions — context, decision, rationale, tradeoffs |
| `tool.md` | Libraries, SDKs, CLIs, platforms — setup, usage, alternatives |

## Interlinking

Docs link to each other and to codebase files using Obsidian-style wikilinks:

```
[[feature:auth-login]]
[[task:auth-t-001]]
[[code:src/auth/login.ts]]
[[architecture:session-tokens]]
[[app:api-server]]
[[tool:drizzle-orm]]
[[test:login-integration]]
```

These become edges in the graph — queryable via Neo4j.

## Recommended Workflow

1. Run `code-kg init-templates` to scaffold the structure into your project.
2. Create a feature doc first — establishes scope and links.
3. Break into task docs — one per implementation unit.
4. Add code docs for key functions/components as you build.
5. Add architecture docs for non-obvious decisions.
6. Run `code-kg sync <path>` after each new or edited doc, or use `code-kg watch`.

## Writing Guidance

- Keep frontmatter `summary` short and specific — it surfaces in graph queries
- Prefer explicit `[[links]]` over implied relationships
- Split large topics into focused docs — one concern per file
- Keep IDs and filenames stable so graph references don't break

## Additional Reference

- [`brain-template/README.md`](../brain-template/README.md)
