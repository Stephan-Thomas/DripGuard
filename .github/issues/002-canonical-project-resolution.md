---
title: "feat: resolve package identities to canonical GitHub projects"
labels: ["enhancement", "resolution"]
---

## Problem Statement
Package names on npm, crates.io, or PyPI do not directly equal GitHub repositories or Drips accounts. Monorepos publish dozens of packages from one repository. Conflating package identity with repository identity causes false positives.

## Proposed Solution
Implement a multi-tier resolution pipeline:
1. Manual overrides in `.drips.yml`.
2. Module import paths (Go).
3. Built-in canonical open-source registry dictionary.
4. Bounded, cached registry lookups.
5. Explicit `unknown` status reporting.

## Acceptance Criteria
- [x] Distinct domain types: `Dependency`, `CanonicalProject`, `ResolvedDependency`.
- [x] Explicit statuses: `resolved`, `ambiguous`, `unknown`, `unsupported`.
- [x] Unresolved packages are never assumed to be funded.

## Testing Requirements
- Unit tests validating URL normalization and resolution fallbacks.
