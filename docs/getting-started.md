# Getting Started

## Overview

`code-kg` connects source code and markdown project docs to a Neo4j graph. It is designed for teams that want a queryable knowledge layer for code structure, features, tasks, and architecture notes.

## Prerequisites

- Node.js 18+ recommended
- npm
- A running Neo4j database
- Watchman if you plan to use `code-kg watch`

## Install Dependencies

For local development from the repository root:

```bash
npm install
npm run build
```

If you want to consume the CLI directly from GitHub in another project:

```bash
npm install github:<owner>/code-kg
```

You can also install from the git URL directly:

```bash
npm install git+https://github.com/<owner>/code-kg.git
```

After the package is published to the npm registry, the standard install command is:

```bash
npm install code-kg
```

## Run the CLI Locally

```bash
node dist/cli.js --help
```

If installed as a dependency in a project, run it with:

```bash
npx code-kg --help
```

If installed globally, run:

```bash
code-kg --help
```

## Initialize a Project

Run the scaffold command in the target repository:

```bash
code-kg init my-project
```

If you installed the package as a local dependency instead of globally, use:

```bash
npx code-kg init my-project
```

If you are developing from this repository without an install step, use:

```bash
node /path/to/code-kg/dist/cli.js init my-project
```

This creates:

- `.graphrc.json`
- the `brain-template` markdown structure in the current project

Existing files are preserved and skipped.

## Default Configuration

`code-kg` loads `.graphrc.json` from the current working directory. The default file created by `init` looks like this:

```json
{
  "project": "my-project",
  "uri": "bolt://localhost:7687",
  "username": "neo4j",
  "password": "neo4j",
  "database": "neo4j",
  "ignoreDirs": [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    "coverage",
    ".cache",
    "out"
  ]
}
```

## Environment Variable Overrides

Environment variables take precedence over `.graphrc.json`:

- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE`
- `GRAPH_PROJECT`
- `GRAPH_DEBOUNCE_MS`

## First Index

Verify database access:

```bash
code-kg ping
```

With a local dependency install:

```bash
npx code-kg ping
```

Build the graph from scratch:

```bash
code-kg rebuild
```

Keep it updated during development:

```bash
code-kg watch
```

With a local dependency install:

```bash
npx code-kg watch
```

## Incremental Updates

When only a few files change, update just those paths:

```bash
code-kg sync src/cli.ts docs/getting-started.md
```

## Troubleshooting

`ping` fails:

- Check Neo4j URI, username, password, and database name
- Confirm the database is reachable from your shell environment

`watch` fails:

- Install Watchman
- Confirm the watchman daemon is available on your machine

`new` fails with missing templates:

- Run `code-kg init` in the target project first
