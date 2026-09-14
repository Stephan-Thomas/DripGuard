# DripGuard Architecture

This document provides a technical deep-dive into the architectural components of DripGuard, explaining domain models, resolution lifecycles, protocol derivations, and deterministic policy evaluation.

---

## 1. High-Level System Architecture

```text
+-------------------------------------------------------------------------+
|                              Repository                                 |
|   package.json, Cargo.toml, go.mod, pyproject.toml, lockfiles          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  Component 1: Multi-Ecosystem Parsers                   |
|   - AST-less, static manifest extraction                                |
|   - Scopes: direct vs transitive, runtime vs dev, optional              |
|   - Abstraction: RepositoryFileSet (disk / memory)                      |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|              Component 2: Canonical Project Normalization               |
|   - Disentangle Package ID vs Repository ID vs Drips Account ID         |
|   - Manual overrides (.drips.yml)                                       |
|   - Deterministic offline registry dictionary                           |
|   - Bounded, cached online registry lookup                              |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  Component 3: Drips Protocol Provider                   |
|   - LiveDripsFundingProvider: Official GraphQL API query layer          |
|   - MockDripsFundingProvider: Deterministic offline fixtures            |
|   - RepoDriver accountId calculation: keccak256 bitwise encoding        |
|   - STRICT: Zero fake fallback on live failure (exit code 3)            |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  Component 4: Deterministic Policy Engine               |
|   - Coverage Calculation (Overall % & Direct %)                         |
|   - Drift Detection (Added, Removed, Stale vs Baseline)                 |
|   - Concentration & Diversity Analysis (HHI Index, Max Share)           |
|   - Rule Evaluation:                                                    |
|     * DependencyCoverageRule                                            |
|     * NewDependencyRule                                                 |
|     * RemovedDependencyRule                                             |
|     * NoStaleAllocationRule                                             |
|     * MaximumConcentrationRule                                          |
|     * RequireFundingForRule                                             |
|     * UnresolvedDependencyRule                                          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|               Component 5: Output Reporters & CI Runners                |
|   - Terminal UX (picocolors)                                            |
|   - JSON Report (dripguard-report.json)                                 |
|   - SARIF 2.1.0 (GitHub Code Scanning)                                  |
|   - PR Comment Manager (Single persistent update)                       |
|   - GitHub Actions Step Summary ($GITHUB_STEP_SUMMARY)                  |
|   - Standardized Exit Codes: 0 (Pass), 1 (Violation), 3 (Unavailable)   |
+-------------------------------------------------------------------------+
```

---

## 2. Separation of Identities

A foundational architectural requirement in DripGuard is maintaining strict boundaries between three distinct identity types:

```text
Package Identity               Repository Identity             Drips Project Identity
(npm: @opentelemetry/api)  ->  (github: open-telemetry/js) ->  (uint256 accountId: 0x01...)
```

### Why this matters
- **Package Identity** is ecosystem-specific and may have arbitrary names, scopes, or aliases.
- **Repository Identity** is the canonical Git forge (`github` or `gitlab`), owner, and repository where maintainers coordinate and publish code.
- **Drips Project Identity** is the on-chain representation in the Drips protocol, governed by `RepoDriver`.

Silently assuming these identities are interchangeable causes catastrophic attribution bugs. DripGuard resolves and tracks all three explicitly in `ResolvedDependency`.

---

## 3. RepoDriver Deterministic Account ID Specification

DripGuard computes on-chain account IDs off-chain using the exact mathematical formulation of `RepoDriver.sol`:

```text
Bit 255          224 223     216 215                                    0
+-------------------+-----------+----------------------------------------+
|  driverId (32b)   | forgeId   |         nameEncoded (216b / 27B)       |
|  (GitHub: 0)      | (8 bits)  |  (Right-padded or keccak256 subarray)  |
+-------------------+-----------+----------------------------------------+
```

- If name byte length $\le 27$:
  - `forgeId = 0`
  - `nameEncoded = bytes right-padded with 0 to 27 bytes`
- If name byte length $> 27$:
  - `forgeId = 1`
  - `nameEncoded = lower 27 bytes of keccak256(name)`

---

## 4. Concentration Measurement: Herfindahl-Hirschman Index (HHI)

DripGuard implements the Herfindahl-Hirschman Index ($HHI$) to measure funding concentration across recipient projects:

$$HHI = \sum_{i=1}^n (s_i)^2$$

Where $s_i$ is the percentage share of total funding allocated to recipient $i$, with $s_i \in [0, 100]$.

- **$HHI < 1500$**: Unconcentrated / diversified funding distribution.
- **$1500 \le HHI \le 2500$**: Moderately concentrated.
- **$HHI > 2500$**: Highly concentrated (flags policy violation if threshold exceeded).
- **Effective Number of Recipients**: $N_{eff} = \frac{10000}{HHI}$.

---

## 5. Security & Isolation Architecture

1. **Manifest Parsing without Script Execution**: Parsers read files as static data structures. No `npm`, `cargo`, or `pip` processes are spawned.
2. **Untrusted Pull Request Safety**: PR runs execute strictly read-only against the repository manifests.
3. **No Secret Leakage**: Tokens and credentials are scrubbed from all terminal outputs, error messages, and reports.
