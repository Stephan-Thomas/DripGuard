# Getting Started with DripGuard

DripGuard is a CLI linter and GitHub Action that continuously checks whether your open-source software dependencies are properly aligned with your [Drips](https://drips.network) funding graph.

---

## Quick Start (30 Seconds)

### 1. Initialize configuration
Run `init` in your repository root:
```bash
npx dripguard init
```
DripGuard detects your package ecosystems (npm, Cargo, Go, Python) and your Git remote, then creates a sensible `.drips.yml` policy file:

```yaml
version: 1
project:
  github: owner/repository

funding:
  minimum_dependency_coverage: 90
  max_single_recipient_share: 70
```

### 2. Run a check
Verify your repository dependencies against your Drips funding configuration:
```bash
npx dripguard check
```

Output:
```text
💧 DripGuard Funding Linter
Continuous verification between software dependencies and Drips funding

Repository: owner/repository
Provider Mode: LIVE (verified against on-chain Drips network)
Detected Ecosystems: npm

Dependency Analysis:
  ✓ 24 applicable dependencies discovered
  ✓ 22 dependencies mapped to canonical projects
  ✓ 20 funding relationships verified on Drips

Funding Coverage:
  Overall:  91% (20/22 funded)
  Direct:   100% (14/14 funded)

Result: PASS
```

---

## Baseline and Funding Drift Detection

To detect newly added unfunded dependencies or removed dependencies in CI pull requests:

### 1. Save a baseline
```bash
npx dripguard check --save-baseline
```
This generates `.dripguard-baseline.json`, which can be committed to your repository.

### 2. Compare in diff mode
```bash
npx dripguard diff
```
If a developer adds a dependency (e.g. `opentelemetry`) that lacks verified Drips funding, DripGuard immediately flags the drift:

```text
Funding Drift vs Baseline:
  + 1 newly added dependencies
    + @opentelemetry/api (npm)
  ✗ 1 new dependencies lack verified funding

Policy Violations (1):
  ✗ new_unfunded_dependency: Newly added dependency "@opentelemetry/api" (open-telemetry/opentelemetry-js) lacks verified Drips funding.

Result: FAIL — Policy violations detected.
```

---

## Explaining Violations

To get instant diagnostic guidance on why a check failed:
```bash
npx dripguard explain
```
Or for a specific dependency:
```bash
npx dripguard explain @opentelemetry/api
```
