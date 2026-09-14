---
title: "feat: implement multi-ecosystem dependency discovery"
labels: ["enhancement", "core", "parsers"]
---

## Problem Statement
A repository's software dependency graph can span multiple ecosystems (npm, Cargo, Go, Python). Modern projects often combine a web frontend, systems backend, and CLI utilities. Hardcoding DripGuard around npm would prevent continuous funding verification on polyglot codebases.

## Proposed Solution
Build an extensible `DependencyParser` interface with passive static parsers for:
- JavaScript/TypeScript: `package.json`, `package-lock.json` (v1/v2/v3), `yarn.lock`, `pnpm-lock.yaml`
- Rust: `Cargo.toml`, `Cargo.lock`
- Go: `go.mod`, `go.sum`
- Python: `requirements.txt`, `pyproject.toml`, `poetry.lock`

## Acceptance Criteria
- [x] Zero shell code execution during manifest analysis.
- [x] Accurate distinction between direct vs transitive and runtime vs dev dependencies.
- [x] Monorepo workspace aggregation without double counting.

## Testing Requirements
- Unit tests for all supported file formats with in-memory filesystems.
