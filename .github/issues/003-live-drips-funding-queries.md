---
title: "feat: integrate live Drips project and funding queries"
labels: ["enhancement", "drips", "web3"]
---

## Problem Statement
DripGuard must inspect real on-chain Drips funding splits and streams. Web3 tools frequently fall back silently to fake mock data when network requests fail, creating dangerous false confidence in CI.

## Proposed Solution
Implement `DripsFundingProvider` abstraction:
1. Exact `RepoDriver.calcAccountId` derivation with Keccak-256.
2. `LiveDripsFundingProvider` querying official Drips GraphQL query layer.
3. `MockDripsFundingProvider` for deterministic offline testing.
4. Strict "No Fake Live Data" rule: Outages produce `UNAVAILABLE` status (exit code 3).

## Acceptance Criteria
- [x] Mathematical equivalence with on-chain `RepoDriver.sol`.
- [x] Retention of raw BigInt units, decimals, symbols, and chain IDs.
- [x] Zero silent fallback from live to mock.

## Testing Requirements
- Unit tests for RepoDriver bitwise hashing and provider outage handling.
