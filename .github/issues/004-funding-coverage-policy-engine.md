---
title: "feat: implement funding coverage policy engine"
labels: ["enhancement", "policy", "engine"]
---

## Problem Statement
Maintainers require flexible, deterministic policies to govern software dependency funding, verify coverage targets, measure concentration risks, and handle in-house exemptions.

## Proposed Solution
Build a deterministic policy engine with modular rules:
- `minimum_dependency_coverage` & `minimum_direct_dependency_coverage`
- `maximum_concentration` (single recipient cap and Herfindahl-Hirschman Index $HHI$)
- `require_funding_for`
- `exceptions.allowed_unfunded` with maintainer reasoning

## Acceptance Criteria
- [x] Standard classifications: `FUNDED`, `PARTIALLY_FUNDED`, `UNFUNDED`, `EXEMPT`, `UNRESOLVED`.
- [x] Accurate HHI computation ($HHI = \sum s_i^2$).
- [x] Machine-readable exit codes: 0 (Pass), 1 (Violation).

## Testing Requirements
- Unit tests for coverage math, concentration indices, and exception matching.
