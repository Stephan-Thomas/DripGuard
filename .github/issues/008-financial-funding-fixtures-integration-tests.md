---
title: "test: add comprehensive financial funding fixtures and integration tests"
labels: ["test", "quality", "ci"]
---

## Problem Statement
A tool enforcing funding policies in CI requires extensive testing across complex financial and graph states (outages, concentration spikes, monorepos, stale splits).

## Proposed Solution
Implement an integration fixture suite in Vitest:
- **Fixture A**: Fully funded dependencies -> PASS (100% coverage)
- **Fixture B**: Newly added unfunded dependency -> FAIL
- **Fixture C**: Unresolved package -> WARN / FAIL
- **Fixture D**: Excessive funding concentration -> FAIL
- **Fixture E**: Stale funding allocations -> WARNING
- **Fixture F**: Upstream provider outage -> UNAVAILABLE (exit code 3)
- **Fixture G**: Mock mode provenance tagging -> DEMO mode

## Acceptance Criteria
- [x] 100% passing tests across all fixtures.
- [x] Verified exit codes for every failure mode.
- [x] Formatter snapshot verification for terminal, JSON, SARIF, and Markdown.

## Testing Requirements
- Vitest suite executed via `pnpm test` and CI workflow.
