# ADR 0002: Multi-Ecosystem Dependency Parser Architecture

## Status
Accepted

## Context
Software projects in the modern open-source landscape frequently incorporate multiple programming languages or package managers within a single repository (e.g. polyglot monorepos containing TypeScript frontend, Rust backend, Python data tools, and Go microservices).

Hard-coding DripGuard around `npm` or `package.json` would severely restrict its utility for the wider OSS ecosystem. Furthermore, executing package manager lifecycle scripts (such as `npm install` or running arbitrary code) merely to inspect dependencies is unacceptable from a security and performance standpoint.

## Decision
We implemented a pluggable `DependencyParser` interface and `ParserRegistry` architecture with static, AST-less and lockfile-aware manifest parsing:

```typescript
export interface DependencyParser {
  readonly ecosystem: Ecosystem;
  readonly supportedFiles: string[];
  detect(files: RepositoryFileSet): boolean;
  parse(files: RepositoryFileSet, options?: ParserOptions): Promise<ParserResult>;
}
```

### Supported Manifests & Lockfiles
1. **JavaScript / TypeScript (`npm`)**:
   - `package.json`: runtime, dev, optional, peer dependencies
   - `package-lock.json` (v1, v2, v3): exact pinned versions and transitive dependencies
   - `yarn.lock` (v1 classic and v2+ berry formats)
   - `pnpm-lock.yaml` (v5, v6, v9 formats)
2. **Rust (`cargo`)**:
   - `Cargo.toml`: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, workspaces
   - `Cargo.lock`: exact locked crates and registry source identifiers
3. **Go (`go`)**:
   - `go.mod`: `require` blocks, differentiating direct from indirect (`// indirect`)
   - `go.sum`: verified module checksums and pinned versions
4. **Python (`pypi`)**:
   - `requirements.txt`, `requirements-dev.txt`
   - `pyproject.toml`: PEP 621 `[project.dependencies]` and Poetry `[tool.poetry.dependencies]`
   - `poetry.lock`: pinned packages and categories

### Virtual Filesystem Abstraction
All parsers operate against `RepositoryFileSet` (implemented via `FileSystemRepositoryFileSet` for disk and `InMemoryRepositoryFileSet` for tests and fixtures). Parsers never execute shell commands or untrusted lifecycle scripts.

## Consequences
- New ecosystems (Ruby, Dart, PHP, Java) can be added as isolated modules without modifying core engine logic.
- Safe static execution without risk of executing malicious lifecycle hooks in untrusted PRs.
- Differentiates direct vs transitive, dev vs runtime, and declared vs locked versions accurately.
