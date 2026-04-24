# code-kg

`code-kg` is a TypeScript CLI that indexes a codebase and a markdown knowledge base into Neo4j so you can query structure, relationships, and project documentation as a graph.

## What It Does

- Parses TypeScript and JavaScript source files with `ts-morph`
- Syncs markdown documentation into graph nodes and relationships
- Scaffolds a reusable project knowledge-base template
- Supports full rebuilds, incremental sync, and watch-based updates

## Documentation

Project docs live in [`docs/`](./docs/README.md).

- [Getting Started](./docs/getting-started.md)
- [CLI Reference](./docs/cli-reference.md)
- [Brain Template Guide](./docs/brain-template.md)
- [AI Agent Setup](./docs/ai-agents.md)

## Installation

For local development in this repository:

```bash
npm install
npm run build
```

After this package is published to the npm registry, install it in another project with:

```bash
npm install code-kg
```

From a GitHub repository:

```bash
npm install github:abhi-laksh/code-kg
```

Or with an explicit git URL:

```bash
npm install git+https://github.com/abhi-laksh/code-kg.git
```

With pnpm:

```bash
pnpm add github:abhi-laksh/code-kg
```

If pnpm blocks the git package build with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, allow `code-kg` in your consuming project's `pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - code-kg
```

Then rerun:

```bash
pnpm install
```

## Quick Start

1. Start a Neo4j instance.
2. Build the CLI:

```bash
npm install
npm run build
```

3. Initialize a project:

```bash
node dist/cli.js init my-project
```

If you installed from GitHub or the npm registry as a local dependency, you can use:

```bash
npx code-kg init my-project
```

If the package binary is on your path, you can use:

```bash
code-kg init my-project
```

4. Configure Neo4j credentials in `.graphrc.json` or environment variables.
5. Verify connectivity:

```bash
node dist/cli.js ping
```

Or, from an installed package:

```bash
npx code-kg ping
```

6. Build the initial graph:

```bash
node dist/cli.js rebuild
```

Or:

```bash
npx code-kg rebuild
```

## Configuration

`code-kg` reads configuration from `.graphrc.json` and supports environment variable overrides:

- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE`
- `GRAPH_PROJECT`
- `GRAPH_DEBOUNCE_MS`

See [Getting Started](./docs/getting-started.md) for the default config shape.

## Development

```bash
npm install
npm run build
```

This repository currently exposes a TypeScript source tree in [`src/`](./src) and generated CLI output in [`dist/`](./dist).

## Open Source Project Files

- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [License](./LICENSE)

## Repository Layout

```text
.
├── src/              # CLI source
├── dist/             # built output
├── brain-template/   # markdown knowledge-base scaffold
└── docs/             # project documentation
```
