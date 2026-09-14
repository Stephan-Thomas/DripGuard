# ADR 0006: GitHub Action Least-Privilege Design & PR Comment Stability

## Status
Accepted

## Context
CI tools and bots often create noise by spamming a new comment on every pull request push or commit. Furthermore, actions that require broad permissions (such as `contents: write` or `issues: write`) or dangerous triggers (such as indiscriminately using `pull_request_target`) introduce serious supply-chain security vulnerabilities in open source repositories.

## Decision
We structured the DripGuard GitHub Action (`action.yml`) around strict security best practices and clean user experience:

### 1. Minimal Least-Privilege Permissions
- Read-only check workflow:
  ```yaml
  permissions:
    contents: read
  ```
- PR commenting workflow:
  ```yaml
  permissions:
    contents: read
    pull-requests: write
  ```
  Only `pull-requests: write` is requested when PR comments are enabled. No personal access token is required; the standard `github.token` is sufficient.

### 2. Single Persistent PR Comment
Instead of posting repeated comments on every workflow run:
- DripGuard embeds a stable invisible HTML comment marker: `<!-- dripguard-report -->`.
- On execution, Octokit queries existing comments on the PR.
- If a previous DripGuard report exists, it is updated in-place (`octokit.rest.issues.updateComment`).
- A new comment is created only on the initial run.

### 3. Native Step Summary Integration
DripGuard appends the complete Markdown report to `$GITHUB_STEP_SUMMARY` (`core.summary.addRaw()`), allowing maintainers to inspect the funding health directly from the GitHub Actions run summary without navigating log files or granting write permissions.

### 4. Workflow Annotations
Rule violations and warnings are emitted as workflow annotations via `core.error()` and `core.warning()`, pointing directly to the manifest source files in the pull request diff view.

## Consequences
- Clean, non-spammy pull request timelines.
- Zero risk of privilege escalation or malicious code execution via forks.
- Native visibility directly in the GitHub Actions UI.
