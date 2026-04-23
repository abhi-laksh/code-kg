# Contributing

## Scope

Contributions are welcome for the CLI, graph model, docs, template design, bug fixes, and developer experience improvements.

## Local Setup

```bash
npm install
npm run build
```

Run the CLI locally:

```bash
node dist/cli.js --help
```

## Development Expectations

- Keep changes focused and easy to review
- Update documentation when behavior or public usage changes
- Preserve backward compatibility where practical, or document breaking changes clearly
- Do not commit secrets, local credentials, or machine-specific configuration

## Documentation Changes

If you change:

- command behavior
- configuration keys
- template layout
- onboarding flow

update the relevant files in `docs/` and `README.md`.

## Pull Requests

1. Fork the repository and create a branch for your change.
2. Make the smallest reasonable change that solves the problem.
3. Build the project locally with `npm run build`.
4. Update docs if needed.
5. Open a pull request with a clear summary, rationale, and validation notes.

## Commit Guidance

- Use clear, descriptive commit messages
- Separate unrelated changes into separate pull requests
- Avoid mixing refactors with behavior changes unless necessary

## Reporting Bugs

When filing a bug, include:

- expected behavior
- actual behavior
- reproduction steps
- Node.js version
- Neo4j version
- relevant config details with secrets removed

## Feature Requests

Open feature requests with:

- the problem being solved
- the desired workflow
- constraints or compatibility concerns
- examples of expected output where applicable
