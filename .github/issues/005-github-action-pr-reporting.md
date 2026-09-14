---
title: "feat: add GitHub Action and pull request reporting"
labels: ["enhancement", "ci", "github-action"]
---

## Problem Statement
Automated CI bots often spam pull requests with repeated comments on every commit, and actions requesting excessive permissions create supply-chain security hazards.

## Proposed Solution
Create a production-grade GitHub Action (`action.yml`):
1. Least-privilege permissions (`contents: read`, optional `pull-requests: write`).
2. Single persistent comment using anchor `<!-- dripguard-report -->`.
3. Native GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`).
4. PR annotations via `core.error()`.

## Acceptance Criteria
- [x] Valid `action.yml` adhering to GitHub Action metadata schema.
- [x] In-place PR comment updates across revisions.
- [x] Formatted Markdown tables with verified repository links.

## Testing Requirements
- Markdown report formatting and comment anchor snapshot tests.
