# Policy Engine & Rules

DripGuard evaluates dependency funding relationships against deterministic policies defined in `.drips.yml`.

---

## Core Rules

### 1. `minimum_dependency_coverage`
Verifies that the overall percentage of funded dependencies meets or exceeds the target.
```yaml
funding:
  minimum_dependency_coverage: 90
```
- **Formula**: $\text{coverage} = \frac{\text{fundedDependencies}}{\text{totalDependencies} - \text{exemptDependencies}} \times 100$
- If coverage < 90%, emits a violation.

### 2. `new_unfunded_dependency`
Detects dependencies newly added to software manifests since the baseline that have no verified funding route.
- Flags: `+ @opentelemetry/api`
- Message: `Newly added dependency lacks verified Drips funding.`

### 3. `stale_funding`
Identifies projects that currently receive outgoing splits or streams from your Drips account, but are no longer present in your codebase's dependency graph.
- Marks candidate as: `STALE FUNDING CANDIDATE`
- Suggests maintainers review whether ongoing funding should be reallocated to active dependencies.

### 4. `max_single_recipient_share` & `max_concentration_hhi`
Prevents extreme concentration where a single dependency or recipient consumes the overwhelming majority of funding.
- **Herfindahl-Hirschman Index (HHI)**:
  $$HHI = \sum_{i=1}^n (s_i)^2$$
  where $s_i$ is the percentage share of recipient $i$ ($s_i \in [0, 100]$).
- A diversified allocation across 4 equal projects has $HHI = 2500$. An allocation directed 85% to one recipient has $HHI > 7200$.

### 5. `require_funding_for`
Enforces 100% funding coverage for specific critical scopes (e.g. `direct` or `runtime`).

### 6. `unresolved_dependency`
Warns or fails if any dependency cannot be mapped to a canonical repository forge.
