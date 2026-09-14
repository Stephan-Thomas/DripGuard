# Demo Repository for DripGuard

This repository demonstrates how DripGuard detects funding drift between a software codebase and its Drips funding graph.

## Scenario
1. Baseline dependencies: `react`, `zod`, and `serde` (100% funded).
2. Recent change: A developer added `@opentelemetry/api` in `package.json`.
3. Drift: `@opentelemetry/api` is not yet funded on Drips.
4. Manual Resolution: Configured in `.drips.yml` so `@opentelemetry/api` resolves to `open-telemetry/opentelemetry-js`.

## Running the Check
```bash
# Inside this directory:
npx dripguard check --mock
```

## Running the Diff
```bash
npx dripguard diff --baseline .dripguard-baseline.json --mock
```
