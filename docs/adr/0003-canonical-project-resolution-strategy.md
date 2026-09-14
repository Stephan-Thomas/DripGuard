# ADR 0003: Canonical Project Resolution Strategy

## Status
Accepted

## Context
A critical pitfall in software dependency analysis is conflating:
1. **Package Identity**: (e.g. `@opentelemetry/api`, `serde`, `requests`, `github.com/gin-gonic/gin`)
2. **Repository Identity**: (e.g. `open-telemetry/opentelemetry-js`, `serde-rs/serde`, `psf/requests`, `gin-gonic/gin`)
3. **Drips Project Identity**: (The deterministic on-chain accountId and claimed profile in Drips Hub)

Monorepos in particular (such as OpenTelemetry, Babel, Tokio, or AWS SDKs) maintain dozens of distinct packages under a single canonical repository and Drips funding recipient. Assuming that package name equals repository name leads to widespread false positives and broken funding checks.

## Decision
We implemented a strict four-stage resolution pipeline with explicit statuses (`resolved`, `ambiguous`, `unknown`, `unsupported`):

1. **Manual Resolution Overrides (`.drips.yml`)**:
   Highest precedence. Maintainers can explicitly map any package to its canonical GitHub/GitLab repository:
   ```yaml
   resolutions:
     npm:
       "@opentelemetry/api":
         github: open-telemetry/opentelemetry-js
   ```
2. **Direct Manifest/Module Coordinates**:
   For ecosystems like Go, module import paths directly contain forge coordinates (e.g. `github.com/gin-gonic/gin`).
3. **Canonical Open Source Dictionary**:
   A deterministic built-in mapping of top open source foundations and libraries across npm, Cargo, Go, and PyPI to enable instantaneous, zero-latency offline checks.
4. **Registry Metadata Resolution**:
   When network access is permitted, queries official registries (`registry.npmjs.org`, `crates.io`, `pypi.org`) with bounded timeout, concurrency limits, in-memory caching, and exponential backoff.
5. **No False Positives Guarantee**:
   If a package cannot be verified, it is marked as `unknown` with clear remediation instructions. Unresolved packages are never silently assumed to be funded.

## Consequences
- Eliminates inaccurate attribution for multi-package monorepos.
- Allows teams to run fully deterministic checks offline without mandatory network round-trips.
- Gives users actionable configuration options when encountering private or unindexed packages.
