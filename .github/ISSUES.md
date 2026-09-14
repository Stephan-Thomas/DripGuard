# DripGuard Project GitHub Issues

This document records the foundational GitHub issues designed and implemented for DripGuard. Each issue outlines the problem, proposed solution, acceptance criteria, and testing requirements.

---

### Issue #1: `feat: implement multi-ecosystem dependency discovery`

- **Labels**: `enhancement`, `core`, `parsers`
- **Status**: Implemented in v0.1.0

#### Problem
Open-source codebases routinely utilize multiple languages and package managers within a single repository (e.g. JavaScript frontend, Rust core, Go microservices, Python scripts). A funding linter hardcoded to `package.json` cannot verify the complete software dependency graph of modern polyglot projects.

#### Proposed Solution
Create a pluggable `DependencyParser` interface and `ParserRegistry` that inspects manifests and lockfiles across four primary ecosystems without executing arbitrary package manager lifecycle scripts:
1. `npm`: `package.json`, `package-lock.json` (v1/v2/v3), `yarn.lock` (v1/v2+), `pnpm-lock.yaml`
2. `cargo`: `Cargo.toml`, `Cargo.lock`
3. `go`: `go.mod`, `go.sum` (differentiating direct from `// indirect`)
4. `pypi`: `requirements.txt`, `pyproject.toml` (PEP 621 & Poetry), `poetry.lock`

#### Acceptance Criteria
- [x] Extensible `DependencyParser` interface with `detect()` and `parse()` methods.
- [x] Safe passive reading without spawning untrusted shell processes.
- [x] Accurate distinction between direct vs transitive and runtime vs dev dependencies.
- [x] Monorepo and workspace traversal without duplicate dependency counts.

#### Testing Requirements
- Unit tests covering each manifest and lockfile variant with mocked in-memory filesystems.

---

### Issue #2: `feat: resolve package identities to canonical GitHub projects`

- **Labels**: `enhancement`, `resolution`
- **Status**: Implemented in v0.1.0

#### Problem
A raw package name (e.g. `@opentelemetry/api`, `tokio`, `requests`) does not equate to a repository or Drips funding recipient. Monorepos often publish dozens of packages under one repository. Confusing package identity with repository identity produces false positives.

#### Proposed Solution
Implement a multi-tier canonical resolution pipeline that disentangles Package Identity, Repository Identity, and Drips Identity:
1. Check manual configuration overrides.
2. Direct module forge coordinates (e.g. Go import paths).
3. Built-in canonical open-source registry dictionary.
4. Cached, bounded registry metadata queries (npm, crates.io, PyPI).
5. Explicit `unknown` status reporting when no mapping can be verified.

#### Acceptance Criteria
- [x] Distinct domain types: `Dependency`, `CanonicalProject`, `ResolvedDependency`.
- [x] Explicit resolution statuses: `resolved`, `ambiguous`, `unknown`, `unsupported`.
- [x] Zero silent guessing or fabricated mappings.

#### Testing Requirements
- Unit tests validating GitHub URL variations, Go import path parsing, and registry fallbacks.

---

### Issue #3: `feat: integrate live Drips project and funding queries`

- **Labels**: `enhancement`, `drips`, `web3`
- **Status**: Implemented in v0.1.0

#### Problem
DripGuard must inspect real on-chain Drips funding splits, streams, and routes. However, Web3 tools frequently fall back silently to fake mock data when network requests fail, creating dangerous false confidence in CI.

#### Proposed Solution
Implement a clean `DripsFundingProvider` abstraction with:
1. Exact `RepoDriver.calcAccountId` derivation matching `RepoDriver.sol` (using Keccak-256 for names > 27 bytes).
2. `LiveDripsFundingProvider` querying official Drips GraphQL query interfaces with exponential backoff and rate limiting.
3. `MockDripsFundingProvider` for deterministic offline testing.
4. Strict "No Fake Live Data" rule: Live failures result in explicit `UNAVAILABLE` status (exit code 3).

#### Acceptance Criteria
- [x] Correct bitwise and keccak256 calculation for `calcAccountId`.
- [x] Preservation of raw BigInt token amounts, decimals, symbols, and chain IDs.
- [x] Explicit `providerMode` tagging (`LIVE` vs `DEMO`).
- [x] Zero silent fallback from live to mock.

#### Testing Requirements
- Tests verifying exact account ID derivation against Drips protocol specs and simulating provider outages.

---

### Issue #4: `feat: implement funding coverage policy engine`

- **Labels**: `enhancement`, `policy`, `engine`
- **Status**: Implemented in v0.1.0

#### Problem
Maintainers need automated, configurable rules that define what funding health means for their repository. Simply checking if a recipient exists is inadequate.

#### Proposed Solution
Build a deterministic policy engine with modular rules:
- `minimum_dependency_coverage`: Verifies overall and direct funding percentages.
- `maximum_concentration`: Calculates single recipient cap and Herfindahl-Hirschman Index (HHI).
- `require_funding_for`: Enforces 100% funding on direct/runtime dependencies.
- `exceptions`: Supports maintainer exemptions in `.drips.yml` with documented reasons.

#### Acceptance Criteria
- [x] Standardized funding classifications: `FUNDED`, `PARTIALLY_FUNDED`, `UNFUNDED`, `EXEMPT`, `UNRESOLVED`.
- [x] HHI mathematical concentration calculation ($HHI = \sum s_i^2$).
- [x] Machine-readable exit codes: 0 (Pass), 1 (Violation), 2 (Config Error).

#### Testing Requirements
- Unit and integration tests for coverage thresholds, exemptions, and concentration caps.

---

### Issue #5: `feat: add GitHub Action and pull request reporting`

- **Labels**: `enhancement`, `ci`, `github-action`
- **Status**: Implemented in v0.1.0

#### Problem
CI tools often pollute pull requests by posting duplicate comments on every push. In addition, actions requesting excessive permissions create security risks.

#### Proposed Solution
Develop a production-quality GitHub Action (`action.yml`):
1. Least-privilege permissions: `contents: read` for checks, `pull-requests: write` only when commenting.
2. Single persistent PR comment: Updates existing comment in-place using stable anchor `<!-- dripguard-report -->`.
3. GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`) integration.
4. Workflow annotations pointing directly to manifest line numbers.

#### Acceptance Criteria
- [x] Valid `action.yml` metadata adhering to GitHub Actions standards.
- [x] Non-spammy single comment updates.
- [x] Rich Markdown tables with verified repository links.

#### Testing Requirements
- Integration tests validating Markdown report formatting and comment anchor consistency.

---

### Issue #6: `feat: add dependency-to-funding drift detection`

- **Labels**: `enhancement`, `diff`, `drift`
- **Status**: Implemented in v0.1.0

#### Problem
When dependencies are added or removed, funding graphs do not automatically update. Maintainers need to catch drift between the baseline state and current PR changes.

#### Proposed Solution
Implement diff mode and baseline management (`dripguard diff`):
1. Store deterministic reviewable baseline in `.dripguard-baseline.json`.
2. Compute dependency graph deltas: added dependencies, removed dependencies, coverage delta.
3. `NewDependencyRule`: Violations for newly added dependencies lacking funding.
4. `NoStaleAllocationRule`: Flags leftover funding splits for removed packages (`STALE FUNDING CANDIDATE`).

#### Acceptance Criteria
- [x] Baseline save and load commands (`--save-baseline`, `dripguard diff`).
- [x] Clear terminal, JSON, and PR diff outputs showing before vs after coverage.

#### Testing Requirements
- Integration tests simulating adding new unfunded dependencies and removing existing ones.

---

### Issue #7: `feat: support manual dependency-to-project resolution overrides`

- **Labels**: `enhancement`, `config`
- **Status**: Implemented in v0.1.0

#### Problem
Automated dependency-to-repository resolution cannot be 100% perfect for private packages, custom mirrors, or unusual monorepo layouts. Guessing repository mappings causes false positives.

#### Proposed Solution
Allow repository maintainers to specify explicit mappings in `.drips.yml`:
```yaml
resolutions:
  npm:
    "@opentelemetry/api":
      github: open-telemetry/opentelemetry-js
```
The resolution engine checks manual overrides before querying registries or heuristics.

#### Acceptance Criteria
- [x] Override support across all four ecosystems (`npm`, `cargo`, `go`, `pypi`).
- [x] Validation of target repository format.
- [x] Attribution source marked as `manual_override`.

#### Testing Requirements
- Tests verifying manual overrides supersede default heuristics and registry lookups.

---

### Issue #8: `test: add comprehensive financial funding fixtures and integration tests`

- **Labels**: `test`, `quality`
- **Status**: Implemented in v0.1.0

#### Problem
Developer tools enforcing financial funding policies require bulletproof verification across complex edge cases (outages, concentration spikes, monorepos).

#### Proposed Solution
Implement a comprehensive Vitest test suite covering:
- **Fixture A**: Fully funded dependencies -> PASS
- **Fixture B**: New unfunded dependency -> FAIL
- **Fixture C**: Unresolved package -> WARN/FAIL
- **Fixture D**: Excessive concentration -> FAIL
- **Fixture E**: Stale funding allocations -> WARNING
- **Fixture F**: Provider unavailable -> UNAVAILABLE (exit code 3)
- **Fixture G**: Mock mode provenance tagging -> DEMO mode

#### Acceptance Criteria
- [x] 100% passing tests across all fixtures.
- [x] Differential tests validating exact baseline comparisons.
- [x] Snapshot verification for terminal, JSON, SARIF, and Markdown formatters.

#### Testing Requirements
- Full automated test execution via `pnpm test`.
