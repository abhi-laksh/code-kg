# AI Agent Setup

## Overview

`code-kg` works well with AI coding agents when you expose your Neo4j graph through MCP and give the agent a Cypher-writing playbook.

This repository already includes a Claude/Codex-friendly skill at [`neo4j-cypher-guide/`](../neo4j-cypher-guide/SKILL.md). Use it together with a Neo4j MCP server so the agent can:

- inspect your graph schema
- run Cypher queries against the indexed project graph
- follow the repo's Cypher rules when generating queries

## Recommended MCP Setup

Use two Neo4j MCP servers:

- `neo4j-read`: the Neo4j Labs/community server from `neo4j-contrib/mcp-neo4j` for read-heavy Cypher access
- `neo4j-all`: the official `neo4j/mcp` server for the broader toolset

This split is useful if you want to keep a stable read path while still having access to the official server.

Repositories:

- Neo4j Labs/community MCP: https://github.com/neo4j-contrib/mcp-neo4j
- Official Neo4j MCP: https://github.com/neo4j/mcp

Both projects currently expect a running Neo4j database, and both document APOC as a requirement for schema inspection.

## Install the MCP Servers

### `neo4j-read` via `uvx`

Install `uv` first if you do not already have it, then use the community package through `uvx`.

Example runtime command:

```bash
/Users/user/.local/bin/uvx mcp-neo4j-cypher --db-url neo4j://127.0.0.1:7687 --username neo4j --password YOUR_PASSWORD --database neo4j
```

### `neo4j-all` via `neo4j-mcp`

Install the official `neo4j-mcp` binary from the official repository's release/install instructions, then verify it is on your `PATH`:

```bash
neo4j-mcp -v
```

## Claude Code Setup

Claude Code supports project-scoped MCP config in `.mcp.json`, and project or personal skills in `.claude/skills/` or `~/.claude/skills/`.

### Add MCP Servers

Create a project-level `.mcp.json` with:

```json
{
  "mcpServers": {
    "neo4j-read": {
      "command": "${UVX_PATH:-/Users/user/.local/bin/uvx}",
      "args": [
        "mcp-neo4j-cypher",
        "--db-url",
        "${NEO4J_URI:-neo4j://127.0.0.1:7687}",
        "--username",
        "${NEO4J_USERNAME:-neo4j}",
        "--password",
        "${NEO4J_PASSWORD}",
        "--database",
        "${NEO4J_DATABASE:-neo4j}"
      ]
    },
    "neo4j-all": {
      "type": "stdio",
      "command": "neo4j-mcp",
      "args": [],
      "env": {
        "NEO4J_URI": "${NEO4J_BOLT_URI:-bolt://localhost:7687}",
        "NEO4J_USERNAME": "${NEO4J_USERNAME:-neo4j}",
        "NEO4J_PASSWORD": "${NEO4J_PASSWORD}",
        "NEO4J_DATABASE": "${NEO4J_DATABASE:-neo4j}"
      }
    }
  }
}
```

Notes:

- Claude Code supports environment variable expansion in `.mcp.json`
- keep secrets in environment variables instead of committing them into the file
- if your machine uses a different `uvx` location, change `UVX_PATH`

You can also add the same servers with the Claude CLI:

```bash
claude mcp add --scope project --transport stdio neo4j-read -- /Users/user/.local/bin/uvx mcp-neo4j-cypher --db-url neo4j://127.0.0.1:7687 --username neo4j --password YOUR_PASSWORD --database neo4j
```

```bash
claude mcp add --scope project --transport stdio --env NEO4J_URI=bolt://localhost:7687 --env NEO4J_USERNAME=neo4j --env NEO4J_PASSWORD=YOUR_PASSWORD --env NEO4J_DATABASE=neo4j neo4j-all -- neo4j-mcp
```

Verify:

```bash
claude mcp list
```

Inside Claude Code, you can also check `/mcp`.

### Add the Cypher Skill to Claude Code

This repository ships a reusable skill in [`neo4j-cypher-guide/`](../neo4j-cypher-guide/SKILL.md).

Claude Code supports two common placements:

- project skill: `.claude/skills/neo4j-cypher-guide/`
- personal skill: `~/.claude/skills/neo4j-cypher-guide/`

Copy or symlink this folder into one of those locations. Example project setup:

```bash
mkdir -p .claude/skills
cp -R neo4j-cypher-guide .claude/skills/neo4j-cypher-guide
```

Or symlink it so updates in this repo stay in sync:

```bash
mkdir -p .claude/skills
ln -s "$(pwd)/neo4j-cypher-guide" .claude/skills/neo4j-cypher-guide
```

After adding the skill, restart Claude Code or start a new session.

Claude can then pick up the skill automatically when a request involves Neo4j or Cypher. You can also reference it directly with `/neo4j-cypher-guide` in Claude Code.

## Codex Setup

Codex can also connect to local MCP servers. In this environment, the current Codex CLI exposes `codex mcp add`, `codex mcp list`, `codex mcp get`, and `codex mcp remove`.

### Add MCP Servers in Codex

Add the community read server:

```bash
codex mcp add neo4j-read -- /Users/user/.local/bin/uvx mcp-neo4j-cypher --db-url neo4j://127.0.0.1:7687 --username neo4j --password YOUR_PASSWORD --database neo4j
```

Add the official server:

```bash
codex mcp add neo4j-all --env NEO4J_URI=bolt://localhost:7687 --env NEO4J_USERNAME=neo4j --env NEO4J_PASSWORD=YOUR_PASSWORD --env NEO4J_DATABASE=neo4j -- neo4j-mcp
```

Verify:

```bash
codex mcp list
```

If you prefer to manage Codex MCP config centrally, Codex also stores MCP configuration in `~/.codex/config.toml`.

### Give Codex Repo-Level Guidance

Codex does not use Claude's `.claude/skills/` directory, but it does respond well to repository instructions in `AGENTS.md`.

Recommended guidance to add in your project `AGENTS.md`:

```md
- Use the Neo4j MCP servers when the task requires graph inspection, schema discovery, or Cypher execution.
- Prefer the `neo4j-read` server for read-only analysis.
- Follow the `neo4j-cypher-guide` skill in this repository when generating or reviewing Cypher.
```

That keeps Codex aligned with the same Cypher rules the Claude skill encodes.

## Suggested Prompting

Once MCP and the skill are installed, these prompts work well:

- "Inspect the Neo4j graph for this repo and summarize the main feature nodes."
- "Use the Neo4j MCP server to find all tasks blocked by auth-related work."
- "Write a modern read-only Cypher query that lists the most connected feature docs."
- "Use the graph plus the markdown docs to explain how the auth flow is implemented."

## Security Notes

- use a restricted Neo4j user where possible
- prefer a read-only server or read-only credentials for exploration
- never commit real passwords into `.mcp.json`, screenshots, or docs
- treat third-party MCP servers as code you are executing locally and review them accordingly

## References

- Neo4j Labs/community MCP: https://github.com/neo4j-contrib/mcp-neo4j
- Official Neo4j MCP: https://github.com/neo4j/mcp
- Claude Code MCP docs: https://docs.claude.com/en/docs/claude-code/mcp
- Claude Code skills docs: https://docs.claude.com/en/docs/claude-code/skills
- OpenAI Docs MCP guide for Codex MCP configuration patterns: https://developers.openai.com/learn/docs-mcp
