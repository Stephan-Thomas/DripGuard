---
title: "feat: add dependency-to-funding drift detection"
labels: ["enhancement", "diff", "drift"]
---

## Problem Statement
When dependencies are added or pruned, funding configurations in Drips do not automatically synchronize. Maintainers need to catch drift between a baseline state and incoming pull requests.

## Proposed Solution
Implement diff mode and baseline management:
1. `dripguard diff --baseline <path>`
2. Store deterministic baseline in `.dripguard-baseline.json`.
3. Detect added dependencies, removed dependencies, and delta in funding coverage.
4. `NewDependencyRule`: Fail on newly added unfunded dependencies.
5. `NoStaleAllocationRule`: Flag outgoing splits directed to removed dependencies as `STALE FUNDING CANDIDATE`.

## Acceptance Criteria
- [x] Baseline generation and diff comparison commands.
- [x] Clear terminal, JSON, and PR diff outputs.

## Testing Requirements
- Integration tests simulating adding and removing dependencies against baseline.
