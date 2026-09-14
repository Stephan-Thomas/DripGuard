### Issue #11: `feat: native GitHub Checks API annotations and file-line inline diagnostics`

- **Labels**: `enhancement`, `github-action`, `dx`
- **Status**: Backlog / Future Enhancement

#### Problem
Currently, DripGuard emits workflow error commands (`core.error` and `core.warning`) that display in the action log. While SARIF integration provides code scanning alerts, developers reviewing PR diffs benefit immensely from seeing inline diagnostic annotations directly on the exact line in `package.json`, `Cargo.toml`, or `go.mod` where the unfunded dependency was introduced.

#### Proposed Solution
1. Map parsed AST line and column numbers during manifest extraction:
   - Record `startLine`, `endLine`, `startColumn`, `endColumn` on each `DiscoveredDependency`.
2. Enhance `src/github/action-runner.ts` to attach precise file location metadata to `@actions/core` annotations:
   ```ts
   core.error(`Unfunded dependency: ${dep.name}`, {
     file: dep.sourceFile,
     startLine: dep.line,
     title: 'DripGuard: Missing Drips Funding'
   });
   ```
3. Leverage the GitHub REST Checks API (`octokit.rest.checks.create`) to publish a dedicated "DripGuard Funding Health" Check Run with detailed inline annotations on pull request diff views.

#### Acceptance Criteria
- [ ] Manifest parsers record line numbers for direct dependency declarations.
- [ ] Action annotations pinpoint the exact manifest line on PR diffs.
- [ ] Dedicated GitHub Check Run created when appropriate permissions are present.
- [ ] Graceful fallback when running in fork pull requests with restricted permissions.

#### Testing Requirements
- Parser tests verifying line number accuracy across formatted JSON, TOML, and YAML manifests.
