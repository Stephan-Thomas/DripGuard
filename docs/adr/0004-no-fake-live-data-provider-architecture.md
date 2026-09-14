# ADR 0004: No Fake Live Data and Provider Separation

## Status
Accepted

## Context
A major design failure in Web3 developer tooling is "silent fallback" — where a live network request fails (due to network timeout, RPC rate limits, or API outages) and the client silently catches the error and serves synthetic or hardcoded demo mock data while claiming the check succeeded.

In financial supply chain verification, silent mock fallback is unacceptable:
- It produces false confidence in CI.
- It displays fabricated recipient balances or funding statuses.
- It masks real upstream network or protocol outages.

## Decision
We enforce a strict "No Fake Live Data" rule across all provider interfaces:

```typescript
export type ProviderMode = 'LIVE' | 'DEMO' | 'UNAVAILABLE' | 'PARTIAL';

export interface DripsFundingProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  resolveProject(input: ProjectLookup): Promise<DripsProject | null>;
  getProjectFunding(project: DripsProject): Promise<ProjectFunding>;
  getProjectSplits(project: DripsProject): Promise<FundingSplit[]>;
  getProjectDependencies(project: DripsProject): Promise<DripsDependency[]>;
  getFundingRoutes(project: DripsProject): Promise<FundingRoute[]>;
}
```

### Absolute Rules
1. **No Silent Fallback**:
   If `LiveDripsFundingProvider` fails to connect or encounters an API error, it emits an explicit `DripsProviderError` and yields an `UNAVAILABLE` state. It NEVER falls back to local fixtures.
2. **Explicit Exit Codes**:
   Network/provider unavailability produces machine-readable `exit code 3` (`ExitCode.PROVIDER_UNAVAILABLE`), which is cleanly differentiated from policy violations (`exit code 1`).
3. **Explicit Provenance Stamping**:
   Every report, whether JSON, Markdown, or terminal, explicitly marks `providerMode: LIVE` vs `providerMode: DEMO`. Mock fixtures are isolated exclusively to `--mock` or unit tests.
4. **Preservation of Raw On-Chain Data**:
   All funding figures preserve `raw` bigint string, `decimals`, `tokenAddress`, `symbol`, and `chainId`. Derived USD figures are optional and clearly identified as secondary conversions.

## Consequences
- Developers and CI pipelines can trust that a `PASS` under `LIVE` mode is backed by real protocol evidence.
- Transient network outages are accurately handled without falsely failing software policy checks or generating fake passes.
