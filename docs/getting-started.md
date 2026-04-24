# Getting Started

## Overview

`code-kg` connects source code and markdown project docs to a Neo4j graph. It is designed for teams that want a queryable knowledge layer for code structure, features, tasks, and architecture notes.

## Prerequisites

- Node.js 18+ recommended
- npm
- A running Neo4j database
- Watchman if you plan to use `code-kg watch`

## Install Globally (Recommended)

Install once and use `code-kg` as a command in any project on your machine.

**From GitHub (works now):**
```bash
npm install -g git+https://github.com/abhi-laksh/code-kg.git
# shorthand:
npm install -g github:abhi-laksh/code-kg
```

**From npm (once published):**
```bash
npm install -g code-kg
```

**From local source (during development):**
```bash
cd /path/to/code-kg
npm install
npm run build
npm link
```

To unlink later: `npm unlink -g code-kg`

Verify the install:
```bash
code-kg --help
```

## Initialize a Project

`cd` into any project and run:

```bash
code-kg init
```

This prompts for your Neo4j connection details (with defaults), writes `.graphrc.json`, and pings the database to confirm the connection.

`code-kg` always reads `.graphrc.json` from the current working directory, so each project has its own config.

To also scaffold the knowledge base doc structure:

```bash
code-kg init-templates
```

This copies the `brain-template` markdown structure into the current project. Existing files are never overwritten.

## Install as a Project Dependency (Alternative)

If you prefer not to install globally, add it as a dev dependency instead.

**npm:**
```bash
npm install --save-dev github:abhi-laksh/code-kg
```

**pnpm:**
```bash
pnpm add -D github:abhi-laksh/code-kg
```

> pnpm blocks build scripts for git-hosted packages by default. If you see `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, create or update `pnpm-workspace.yaml` at the project root:
> ```yaml
> onlyBuiltDependencies:
>   - code-kg
> ```
> Then rerun `pnpm install`.

Run via npx / pnpm exec:
```bash
npx code-kg init
pnpm exec code-kg init
```

## Local Development (from source)

```bash
cd /path/to/code-kg
npm install
npm run build
node dist/cli.js --help
```

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

Build the graph from scratch:

```bash
code-kg rebuild
```

Keep it updated during development:

```bash
code-kg watch
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

- Run `code-kg init-templates` in the target project first
