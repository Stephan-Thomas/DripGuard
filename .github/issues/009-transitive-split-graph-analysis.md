### Issue #9: `feat: recursive transitive split-graph and downstream pass-through policy analysis`

- **Labels**: `enhancement`, `policy`, `graph`
- **Status**: Backlog / Future Enhancement

#### Problem
Currently, DripGuard inspects direct funding splits from the host repository to its direct and indirect software dependencies. However, in the Drips protocol, dependencies themselves can configure splits (split-trees and drip lists) that stream funds downstream to their transitive foundations. Maintainers lack visibility into whether their funded dependencies are actually passing funds down to critical deep-stack infrastructure.

#### Proposed Solution
1. Implement a recursive funding graph traversal in `DripsFundingProvider`:
   - Query splits of recipient projects up to a configurable depth (e.g. `max_depth: 3`).
   - Track pass-through percentages and calculate effective funding weight received by downstream dependencies.
2. Introduce a `transitive_pass_through` policy rule:
   - Flag "funding sinks" (dependencies that receive significant allocations but pass 0% downstream despite having substantial open-source dependencies).
   - Compute the full recursive funding reach of the project's Drips configuration.

#### Acceptance Criteria
- [ ] Graph cycle detection to prevent infinite recursion on reciprocal funding splits.
- [ ] Configurable traversal depth limit in `.drips.yml`.
- [ ] Markdown and JSON visualization of the multi-tier funding tree.
- [ ] Bounded query batching to respect GraphQL rate limits.

#### Testing Requirements
- Fixture tests with multi-tier DAGs (A -> B -> C and circular splits A -> B -> A).
