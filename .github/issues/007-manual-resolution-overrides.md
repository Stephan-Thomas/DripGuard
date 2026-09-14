---
title: "feat: support manual dependency-to-project resolution overrides"
labels: ["enhancement", "config"]
---

## Problem Statement
Automatic dependency resolution can fail or be ambiguous for internal packages, private forks, or custom monorepos. Guessing causes false positives.

## Proposed Solution
Provide manual resolution configuration in `.drips.yml`:
```yaml
resolutions:
  npm:
    "@opentelemetry/api":
      github: open-telemetry/opentelemetry-js
```
The resolution pipeline checks this table first before applying heuristics or registry queries.

## Acceptance Criteria
- [x] Multi-ecosystem override support (`npm`, `cargo`, `go`, `pypi`).
- [x] Format validation of GitHub/GitLab target coordinates.
- [x] Resolution source flagged as `manual_override`.

## Testing Requirements
- Unit tests verifying manual overrides supersede default heuristics.
