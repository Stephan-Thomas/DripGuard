# ADR 0001: Deterministic Policy Engine and Classification Model

## Status
Accepted

## Context
Traditional funding dashboards provide post-hoc analytics ("how much money was streamed?"), but fail to provide continuous automated guardrails inside software developer workflows. When developers modify dependencies across manifests (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`), the software dependency graph evolves immediately while the Drips funding configuration remains static.

To serve as a continuous CI linter (akin to ESLint, cargo-deny, or Dependabot), DripGuard requires a strictly deterministic, reproducible policy engine that evaluates whether a repository's funding graph aligns with its software dependencies.

## Decision
We implemented a deterministic policy engine with explicit funding classifications:
- `FUNDED`: Verified active streams or splits directing funds to the canonical project.
- `PARTIALLY_FUNDED`: Some routes exist, or funding falls below a configured threshold.
- `UNFUNDED`: Project has a resolved canonical repository, but zero verified funding relationships.
- `UNKNOWN`: The query failed or ambiguous forge data was returned.
- `UNRESOLVED`: The package could not be resolved to a canonical repository.
- `EXEMPT`: Explicit maintainer exemption configured in `.drips.yml` (with maintainer explanation).

### Rule Hierarchy
1. `DependencyCoverageRule`: Compares overall and direct dependency coverage against configured percentage thresholds (`minimum_dependency_coverage`, `minimum_direct_dependency_coverage`).
2. `NewDependencyRule`: Detects dependencies added since baseline that lack verified funding.
3. `RemovedDependencyRule`: Detects dependencies removed from the project to signal potential reallocations.
4. `NoStaleAllocationRule`: Detects outgoing funding splits/streams to projects no longer in the active dependency graph (`STALE FUNDING CANDIDATE`).
5. `MaximumConcentrationRule`: Measures single recipient cap and the Herfindahl-Hirschman Index ($HHI = \sum s_i^2$).
6. `RequireFundingForRule`: Requires 100% funding on specific scopes (direct vs runtime).

## Consequences
- The engine produces stable, reproducible results given the same manifests and funding snapshot.
- Maintains a clean distinction between policy failures (exit code 1) and system or network failures (exit code 3).
- Avoids false positives by supporting explicit maintainer exemptions and manual resolution overrides.
