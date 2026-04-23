# Brain Template Guide

## Purpose

The bundled `brain-template` provides a markdown structure for documenting features, flows, tasks, edge cases, architecture, and implementation details in a graph-friendly way.

## Core Model

Each markdown file is treated as a node.

- Frontmatter stores machine-friendly metadata
- Body content stores human-readable detail
- `[[namespace:id]]` links become graph edges

## Included Template Files

The template bundle lives in [`brain-template/`](../brain-template/README.md) and includes:

- feature index templates
- subfeature index templates
- task templates
- flow, error, and edge-case templates
- frontend and backend templates
- architecture and ADR templates

## Recommended Workflow

1. Run `code-kg init` in the target project.
2. Start with feature and subfeature index files.
3. Add task docs before implementation work begins.
4. Link related docs with `[[...]]` references.
5. Run `code-kg sync` or `code-kg rebuild` to push docs into Neo4j.

## Writing Guidance

- Keep frontmatter summaries short and specific
- Prefer explicit links over implied relationships
- Split large topics into separate docs instead of growing one file indefinitely
- Keep naming stable so graph references remain predictable

## Additional Reference

The deeper structure and naming conventions are documented in:

- [`brain-template/README.md`](../brain-template/README.md)
- [`brain-template/relationships.md`](../brain-template/relationships.md)
