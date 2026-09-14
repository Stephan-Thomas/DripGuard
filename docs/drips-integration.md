# Drips Protocol Integration

DripGuard interfaces with the [Drips Protocol](https://drips.network), an open-source, decentralized funding layer built on EVM-compatible blockchains that allows recursive funding streams, drip lists, and dependency splits.

---

## The "No Fake Live Data" Guarantee

DripGuard follows a strict rule: **Live checks never silently fall back to mock data.**

- If the Drips GraphQL API is unreachable or returns an error, DripGuard exits with `exit code 3` (`PROVIDER_UNAVAILABLE`).
- Results clearly report whether data originated from:
  - `LIVE`: Verified against the official Drips network endpoint.
  - `DEMO`: Offline deterministic mock provider (invoked via `--mock`).
  - `UNAVAILABLE`: Network or API outage encountered.

---

## RepoDriver Deterministic Account IDs

Every GitHub repository possesses a unique, deterministic on-chain account ID governed by Drips `RepoDriver.sol`.

DripGuard computes this ID off-chain using the exact protocol specification:
```typescript
import { calcAccountId } from 'dripguard';

const accountId = calcAccountId('github', 'colinhacks', 'zod');
// Returns 256-bit uint256 string matching Drips Hub
```

### Supported Networks
Drips is deployed across multiple EVM networks, including:
- **Ethereum Mainnet** (`chainId: 1`)
- **Optimism** (`chainId: 10`)
- **Filecoin** (`chainId: 314`)
- **Metis** (`chainId: 1088`)
- **Base** (`chainId: 8453`)

---

## Querying Splits & Routes

DripGuard queries:
- **Project Splits**: Outgoing percentage shares directed from the repository's account to dependency accounts.
- **Dependency Routes**: Multi-hop funding pathways (splits, streams, drip lists) connecting parent projects to dependencies.
- **Preserved Metadata**: Token contract addresses, symbols, chain IDs, raw BigInt funding units, and block timestamps are kept intact.
