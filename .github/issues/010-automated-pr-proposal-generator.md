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

#### Testing Requirements
- Snapshot tests verifying deterministic split calculation across diverse dependency additions.
