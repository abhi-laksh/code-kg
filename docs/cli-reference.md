# CLI Reference

## Commands

## `code-kg init [projectName]`

Scaffolds `.graphrc.json` and the bundled markdown knowledge-base structure into the current directory.

Example:

```bash
code-kg init my-project
```

## `code-kg ping`

Verifies the Neo4j connection and prints database stats.

Example:

```bash
code-kg ping
```

## `code-kg rebuild`

Deletes the existing graph and re-indexes the entire project from scratch.

Example:

```bash
code-kg rebuild
```

Options:

- `--fast`: use name-based call resolution instead of the more accurate type-following mode

## `code-kg sync <paths...>`

Incrementally updates the graph for a specific list of changed paths.

Example:

```bash
code-kg sync src/commands/sync.ts README.md
```

Options:

- `--fast`: use fast call resolution

## `code-kg watch`

Subscribes to filesystem changes through Watchman and applies batched graph updates.

Example:

```bash
code-kg watch
```

Options:

- `--fast`: use fast call resolution

## `code-kg new <type> <path>`

Creates a markdown doc from one of the bundled templates.

Supported types:

- `feature`
- `subfeature`
- `task`
- `flow`
- `error`
- `edge-case`
- `test-case`
- `page`
- `component`
- `state`
- `function`
- `architecture`
- `adr`

Example:

```bash
code-kg new task features/auth/tasks/auth-t-001.md
```

## Notes

- `init` and `new` operate on the current working directory
- `rebuild` removes all graph nodes before re-indexing
- `sync` is safer for routine development updates
- `watch` writes its resume state to `.graph.clock`
