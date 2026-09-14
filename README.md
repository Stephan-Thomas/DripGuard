# DripGuard

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-DripGuard-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/dripguard)
[![Release](https://img.shields.io/badge/release-v1.0.0-green?style=flat-square)](https://github.com/Stephan-Thomas/DripGuard/releases/tag/v1.0.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![CI](https://github.com/Stephan-Thomas/DripGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/Stephan-Thomas/DripGuard/actions/workflows/ci.yml)

A funding-supply-chain linter for open source.

**DripGuard detects drift between an open-source project's software dependency graph and its Drips funding graph.**

Your dependencies change.  
Your funding policy should notice.

```text
$ dripguard check

💧 DripGuard Funding Linter
Continuous verification between software dependencies and Drips funding

Repository: Stephan-Thomas/DripGuard
Provider Mode: LIVE (verified against on-chain Drips network)
Detected Ecosystems: npm

Dependency Analysis:
  ✓ 24 applicable dependencies discovered
  ✓ 22 dependencies mapped to canonical projects
  ✓ 19 funding relationships verified on Drips

Funding Coverage:
  Overall:  86% (19/22 funded)
  Direct:   88% (14/16 funded)

Funding Drift:
  ✗ 3 dependencies lack verified funding coverage

Policy Violations (1):
  ✗ minimum_dependency_coverage: Dependency coverage is 86%, which is below the configured minimum of 90%.

Result: FAIL — Policy violations detected.
```

---

## The Problem: Funding Drift

A modern repository's dependency graph changes constantly. Maintainers and contributors routinely add, upgrade, replace, or prune libraries in files like:

* `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
* `Cargo.toml`, `Cargo.lock`
* `go.mod`, `go.sum`
* `requirements.txt`, `pyproject.toml`, `poetry.lock`

However, a project's [Drips](https://drips.network) funding configuration (splits, streams, drip lists) often remains unchanged. That discrepancy creates **funding drift**:

1. **New dependencies arrive unfunded**: You add OpenTelemetry or Zap to your production stack, but none of your funding streams reach their maintainers.
2. **Removed dependencies receive stale splits**: You migrated away from a library months ago, but your project's smart contract is still continuously sending money to it.
3. **Funding becomes overly concentrated**: A single popular package consumes 95% of your funding, starving upstream transitive foundations.

**DripGuard brings continuous policy enforcement to open-source funding.** It behaves like ESLint, Dependabot, or `cargo-deny`, but for Drips funding relationships.

---

## Why DripGuard?

| Feature | Generic Dashboards | DripForge | DripGuard |
|:---|:---:|:---:|:---:|
| **Primary Question** | "How much money exists?" | "What is happening across funding?" | **"Has my software drifted from my funding policy?"** |
| **CI / Pull Request Enforcement** | ❌ No | ❌ No | **✅ Yes (blocks PRs on policy failure)** |
| **CLI Linter Experience** | ❌ Web only | ❌ Web only | **✅ Local CLI tool (`dripguard check`)** |
| **Multi-Ecosystem Discovery** | ❌ Limited | ❌ Limited | **✅ npm, Cargo, Go, Python (direct & lockfiles)** |
| **Canonical Project Resolution** | ❌ Name guessing | ❌ Direct accounts | **✅ Disentangles Package $\neq$ Repo $\neq$ Drips ID** |
| **Drift & Baseline Tracking** | ❌ No | ❌ No | **✅ Baseline comparisons (`dripguard diff`)** |
| **Zero Synthetic Live Data** | ⚠️ Fallback mocks | ⚠️ Fallback mocks | **✅ Strict guarantee: No fake live data** |

---

## Architecture Overview

```text
Repository Manifests & Lockfiles
  (package.json, Cargo.toml, go.mod, pyproject.toml)
           ↓
   [Dependency Parsers]
           ↓
   [Canonical Project Normalization] (Package ID → Repository ID → Drips ID)
           ↓
   [Drips Protocol Integration] (RepoDriver.calcAccountId & GraphQL)
           ↓
    [Deterministic Policy Engine]
      • DependencyCoverageRule (minimum % coverage)
      • NewDependencyRule (detects newly added unfunded deps)
      • RemovedDependencyRule (flags removed deps)
      • NoStaleAllocationRule (detects stale splits)
      • MaximumConcentrationRule (enforces HHI & max share)
           ↓
   [Reporting & Feedback]
      • Terminal CLI output
      • GitHub Action Workflow Step Summary
      • Single persistent PR comment (non-spammy)
      • SARIF 2.1.0 (GitHub Code Scanning)
      • Machine-readable JSON report
           ↓
       Exit Codes (0 = Pass, 1 = Violation, 2 = Config Error, 3 = Provider Unavailable, 4 = Fatal)
```

---

## Installation & CLI Usage

### Global or npx execution
```bash
# Run a check on the current repository
npx dripguard check

# Check with deterministic mock provider (offline / demo mode)
npx dripguard check --mock

# Output in JSON format
npx dripguard check --format json

# Output in SARIF format for code scanning
npx dripguard check --format sarif

# Save a baseline of current dependencies
npx dripguard check --save-baseline

# Detect funding drift against baseline
npx dripguard diff

# Explain why a policy failed or why a dependency is unfunded
npx dripguard explain @opentelemetry/api

# List discovered dependencies and resolved repositories
npx dripguard dependencies

# Inspect Drips funding splits and routes
npx dripguard funding

# Validate .drips.yml syntax
npx dripguard validate
```

---

## Configuration (`.drips.yml`)

Initialize a starter configuration tailored to your repository:
```bash
npx dripguard init
```

Example `.drips.yml`:
```yaml
version: 1

project:
  github: owner/repository

dependencies:
  include:
    - runtime
    - direct
  exclude:
    - dev
    - optional

funding:
  minimum_dependency_coverage: 90
  minimum_direct_dependency_coverage: 100
  max_single_recipient_share: 70
  max_concentration_hhi: 2500

policy:
  fail_on:
    - new_unfunded_dependency
    - insufficient_coverage
    - concentration
  warn_on:
    - stale_funding
    - unresolved_dependency

exceptions:
  allowed_unfunded:
    internal-helper:
      reason: "In-house package not eligible for public Drips funding"
  ignored_projects: []

resolutions:
  npm:
    "@opentelemetry/api":
      github: open-telemetry/opentelemetry-js

output:
  comment_on_pull_request: true
  create_summary: true
  format: text
```

---

## GitHub Action Setup

Add DripGuard to your CI workflow in `.github/workflows/dripguard.yml`:

```yaml
name: DripGuard Funding Drift Check

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write # Required only if comment: 'true' is enabled

jobs:
  verify-funding:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run DripGuard Check
        uses: Stephan-Thomas/DripGuard@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          provider: 'live' # Default is 'live'; use 'mock' for offline sandbox testing
          comment: 'true'
          summary: 'true'
```

### Action Permissions Matrix

| Permission | Scope | Required? | Why It's Needed |
|:---|:---|:---:|:---|
| `contents: read` | Repository | **Always** | To read dependency manifests (`package.json`, `Cargo.toml`, etc.) and `.drips.yml`. |
| `pull-requests: write` | Pull Requests | **Optional** | Only needed when `comment: 'true'` to post/update the sticky funding health comment. |
| `security-events: write` | Code Scanning | **Optional** | Only needed when uploading SARIF reports (`format: 'sarif'`) to GitHub Code Scanning. |

> [!NOTE]
> If your organization disallows `pull-requests: write`, simply set `comment: 'false'`. DripGuard will run in pure read-only mode (`contents: read`) and publish the full interactive report directly to the GitHub Action **Step Summary**!

### Action Inputs

| Input | Description | Default |
|:---|:---|:---:|
| `provider` | Provider mode: `'live'` (queries Drips GraphQL API) or `'mock'` (offline fixtures) | `'live'` |
| `config` | Path to `.drips.yml` configuration file | `'.drips.yml'` |
| `baseline` | Path to baseline file (`.dripguard-baseline.json`) for diff mode | `'.dripguard-baseline.json'` |
| `comment` | Post or update sticky Markdown report comment on PRs | `'true'` |
| `summary` | Append rich Markdown summary to `$GITHUB_STEP_SUMMARY` | `'true'` |
| `format` | Output report format (`'text'`, `'json'`, `'sarif'`) | `'text'` |
| `working-directory` | Path of repository directory to inspect | `'.'` |
| `github-token` | GitHub token for PR comments | `${{ github.token }}` |

### Action Outputs

| Output | Type | Description |
|:---|:---:|:---|
| `status` | string | Evaluation outcome: `'pass'`, `'fail'`, or `'warn'` |
| `coverage-percent` | string | Overall percentage of dependencies with verified funding coverage |
| `violations-count` | string | Number of policy violations detected |
| `unfunded-count` | string | Number of unfunded dependencies discovered |
| `report-path` | string | Absolute path to the generated `dripguard-report.json` |

### Pull Request Comment Experience
DripGuard creates or updates a **single persistent comment** across PR revisions without spamming:

```markdown
<!-- dripguard-report -->
## 💧 DripGuard Funding Health Report

❌ **Status: FAILED (policy violations)**

**Repository:** `Stephan-Thomas/DripGuard` | **Provider:** `LIVE`

### Funding Coverage

| Metric | Result | Target |
|:---|---:|---:|
| Total Applicable Dependencies | 24 | - |
| Canonical Projects Mapped | 22 | - |
| Verified Funded on Drips | 19 | - |
| Unfunded Dependencies | 3 | 0 |
| **Overall Coverage** | **86%** | **90%** |
| **Direct Dependency Coverage** | **88%** | **100%** |

### 🔄 Funding Drift vs Baseline

#### ❌ Newly Added Unfunded Dependencies
- `@opentelemetry/api` (npm) → [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js)

### ⚠️ Policy Violations
- ❌ **`minimum_dependency_coverage`**: Dependency coverage is 86%, which is below the configured minimum of 90%.
```

---

## Supported Ecosystems

DripGuard inspects manifests and lockfiles statically without executing arbitrary repository lifecycle scripts:

* **JavaScript / TypeScript**: `package.json`, `package-lock.json` (v1/v2/v3), `yarn.lock` (v1/v2+), `pnpm-lock.yaml`
* **Rust**: `Cargo.toml`, `Cargo.lock`
* **Go**: `go.mod`, `go.sum` (distinguishing direct from `// indirect`)
* **Python**: `requirements.txt`, `requirements-dev.txt`, `pyproject.toml` (PEP 621 & Poetry), `poetry.lock`

---

## Machine-Friendly Exit Codes

| Code | Label | Meaning |
|:---:|:---|:---|
| `0` | `PASS` | All dependencies satisfy configured funding policies |
| `1` | `POLICY_VIOLATION` | One or more policy rules failed |
| `2` | `CONFIGURATION_ERROR` | `.drips.yml` missing, invalid syntax, or schema failure |
| `3` | `PROVIDER_UNAVAILABLE` | External Drips network or registry unreachable (no fake fallback) |
| `4` | `INTERNAL_ERROR` | Fatal runtime error |

---

## Documentation

* [Getting Started](docs/getting-started.md)
* [Configuration Guide](docs/configuration.md)
* [Canonical Project Resolution](docs/dependency-resolution.md)
* [Drips Protocol Integration](docs/drips-integration.md)
* [GitHub Action Guide](docs/github-action.md)
* [Policy Engine & Rules](docs/policy-engine.md)
* [Output Formats & SARIF](docs/output-formats.md)
* [Troubleshooting](docs/troubleshooting.md)
* [Architecture Decision Records (ADR)](docs/adr/)

---

## Contributing & License

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).  
Licensed under the [MIT License](LICENSE).
