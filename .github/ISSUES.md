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

---

### Issue #9: `feat: recursive transitive split-graph and downstream pass-through policy analysis`

- **Labels**: `enhancement`, `policy`, `graph`
- **Status**: Backlog / Future Enhancement

#### Problem
Currently, DripGuard inspects direct funding splits from the host repository to its direct and indirect software dependencies. However, in the Drips protocol, dependencies themselves can configure splits (split-trees and drip lists) that stream funds downstream to their transitive foundations. Maintainers lack visibility into whether their funded dependencies are actually passing funds down to critical deep-stack infrastructure.

#### Proposed Solution
1. Implement a recursive funding graph traversal in `DripsFundingProvider`:
   - Query splits of recipient projects up to a configurable depth (e.g. `max_depth: 3`).
   - Track pass-through percentages and calculate effective funding weight received by downstream dependencies.
2. Introduce a `transitive_pass_through` policy rule:
   - Flag "funding sinks" (dependencies that receive significant allocations but pass 0% downstream despite having substantial open-source dependencies).
   - Compute the full recursive funding reach of the project's Drips configuration.

#### Acceptance Criteria
- [ ] Graph cycle detection to prevent infinite recursion on reciprocal funding splits.
- [ ] Configurable traversal depth limit in `.drips.yml`.
- [ ] Markdown and JSON visualization of the multi-tier funding tree.
- [ ] Bounded query batching to respect GraphQL rate limits.

---

### Issue #10: `feat: automated GitHub Pull Request proposal generator for missing splits`

- **Labels**: `enhancement`, `automation`, `cli`
- **Status**: Backlog / Future Enhancement

#### Problem
When DripGuard detects newly added unfunded dependencies during CI or local check, developers must manually identify the missing recipient repositories, calculate appropriate split weights according to policy thresholds, and formulate a configuration update. This friction delays funding remediation.

#### Proposed Solution
Create an interactive CLI command `dripguard remediate` and an optional GitHub Action workflow step that automatically generates:
1. An updated `.drips.yml` candidate proposal incorporating new dependencies with calculated split weights that satisfy coverage and concentration policies.
2. A machine-readable Drips transaction payload (or safe multi-sig proposal URL) ready for maintainer signature on Drips App.
3. An automated GitHub PR or Git patch that maintainers can review and merge with a single click.

#### Acceptance Criteria
- [ ] `dripguard remediate --propose-pr` generates a git branch with formatted configuration diff.
- [ ] Split weight calculation algorithms guarantee compliance with `minimum_dependency_coverage` and `max_single_recipient_share`.
- [ ] Preserves all existing manual overrides and exemptions in `.drips.yml`.
- [ ] Dry-run mode (`--dry-run`) displaying proposed changes in terminal diff format.

---

### Issue #11: `feat: native GitHub Checks API annotations and file-line inline diagnostics`

- **Labels**: `enhancement`, `github-action`, `dx`
- **Status**: Backlog / Future Enhancement

#### Problem
Currently, DripGuard emits workflow error commands (`core.error` and `core.warning`) that display in the action log. While SARIF integration provides code scanning alerts, developers reviewing PR diffs benefit immensely from seeing inline diagnostic annotations directly on the exact line in `package.json`, `Cargo.toml`, or `go.mod` where the unfunded dependency was introduced.

#### Proposed Solution
1. Map parsed AST line and column numbers during manifest extraction:
   - Record `startLine`, `endLine`, `startColumn`, `endColumn` on each `DiscoveredDependency`.
2. Enhance `src/github/action-runner.ts` to attach precise file location metadata to `@actions/core` annotations.
3. Leverage the GitHub REST Checks API (`octokit.rest.checks.create`) to publish a dedicated "DripGuard Funding Health" Check Run with detailed inline annotations on pull request diff views.

#### Acceptance Criteria
- [ ] Manifest parsers record line numbers for direct dependency declarations.
- [ ] Action annotations pinpoint the exact manifest line on PR diffs.
- [ ] Dedicated GitHub Check Run created when appropriate permissions are present.
- [ ] Graceful fallback when running in fork pull requests with restricted permissions.

---

### Issue #12: `feat: package manager parsers for Composer (PHP) and Bundler (Ruby)`

- **Labels**: `enhancement`, `parsers`, `ecosystems`
- **Status**: Backlog / Future Enhancement

#### Problem
DripGuard currently supports JavaScript/TypeScript (`npm`, `yarn`, `pnpm`), Rust (`Cargo`), Go (`go.mod`), and Python (`pip`, `poetry`). Major open-source web ecosystems like PHP (Laravel, Symfony, WordPress) and Ruby (Rails, Sinatra) represent thousands of open-source projects using Drips that need automated funding drift verification.

#### Proposed Solution
1. Implement `ComposerParser`:
   - Parse `composer.json` (direct `require` vs `require-dev`).
   - Parse `composer.lock` for exact package versions and source repository metadata.
   - Map Packagist vendor/name coordinates to canonical GitHub repositories.
2. Implement `BundlerParser`:
   - Parse `Gemfile` (direct dependencies, group scoping: `production` vs `development`).
   - Parse `Gemfile.lock` for locked dependency tree.
   - Query RubyGems API or built-in dictionary for canonical source code repository links.

#### Acceptance Criteria
- [ ] Static, safe parsing without executing PHP or Ruby binaries.
- [ ] Differentiates runtime from dev/test dependencies.
- [ ] Normalizes GitHub repository links from Packagist and RubyGems metadata.
- [ ] Included in `defaultParserRegistry`.

---

### Issue #13: `feat: persistent canonical project resolution cache across CI invocations`

- **Labels**: `enhancement`, `performance`, `ci`
- **Status**: Backlog / Future Enhancement

#### Problem
In large enterprise repositories with hundreds of dependencies, querying online package registries (npm, crates.io, PyPI) to resolve canonical GitHub repositories can introduce latency and risk upstream registry HTTP rate limits (e.g. 429 Too Many Requests) across frequent CI runs.

#### Proposed Solution
1. Introduce a structured resolution cache format (`.dripguard-cache.json`) storing verified mappings.
2. Integrate with GitHub Actions cache (`@actions/cache`):
   - Automatically restore and save `.dripguard-cache.json` between workflow runs using cache keys based on dependency lockfile hashes.
3. Add CLI flags `--cache-dir <path>` and `--no-cache` to control local persistence.

#### Acceptance Criteria
- [ ] Sub-second CI resolution time on warm cache hits.
- [ ] Cryptographic checksum verification to detect stale or invalid cache entries.
- [ ] Automatic cache eviction for entries older than a configurable TTL (default 30 days).
- [ ] Complete offline capability when run with a pre-populated cache file.

---

### Issue #14: `feat: multi-chain Drips network aggregation (Arbitrum, Polygon, and custom L2s)`

- **Labels**: `enhancement`, `drips`, `multi-chain`
- **Status**: Backlog / Future Enhancement

#### Problem
The Drips protocol is expanding beyond Ethereum Mainnet and Optimism to high-throughput, low-fee networks like Base, Arbitrum One, and Polygon. Open-source projects may configure primary splits on Base while receiving recurring streaming donations on Ethereum Mainnet. Currently, evaluation targets a single default chain or GraphQL endpoint, which can overlook cross-chain allocations.

#### Proposed Solution
1. Extend `DripsConfigSchema` to support multi-chain configuration (`drips.chains`).
2. Enhance `LiveDripsFundingProvider` to aggregate multi-chain splits and streams:
   - Query project balances, splits, and streams across all configured networks.
   - Aggregate effective weights and compute normalized multi-chain coverage metrics.
   - Present network breakdown badges in Markdown reports and Step Summaries.

#### Acceptance Criteria
- [ ] Aggregated funding view combining streams and splits across multiple chains.
- [ ] Robust per-chain error boundaries: failure on one secondary RPC does not fail overall evaluation if primary endpoint responds.
- [ ] Clear chain attribution in PR comments and Step Summaries.

