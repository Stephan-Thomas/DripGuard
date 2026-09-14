# ADR 0005: RepoDriver Account ID Derivation

## Status
Accepted

## Context
In the Drips Protocol (v2), repositories hosted on code forges like GitHub or GitLab are assigned deterministic on-chain account IDs managed by the `RepoDriver` contract. This enables projects to receive streams and splits even before their maintainers claim ownership of the on-chain account.

To query or verify funding relationships without relying exclusively on centralized indexers, DripGuard needs to derive exact `accountId` values deterministically from the canonical repository coordinates (`owner` and `repository`).

## Decision
We implemented the exact bitwise and hashing specification defined in Drips `RepoDriver.sol`:

### Bitwise Layout (256-bit `uint256`)
- `driverId`: 32 bits (bits 224..255)
- `forgeId`: 8 bits (bits 216..223)
- `nameEncoded`: 216 bits (27 bytes, bits 0..215)

### Derivation Rules for GitHub
For a repository formatted as `owner/repo` (lowercase UTF-8 bytes):
1. **Names $\le 27$ bytes**:
   - `forgeId = 0`
   - `nameEncoded`: UTF-8 bytes right-padded with zeroes up to 27 bytes.
2. **Names $> 27$ bytes**:
   - `forgeId = 1`
   - `nameEncoded`: Lower 27 bytes of `keccak256(name)`.

### Assembly
```typescript
const accountId = (BigInt(driverId) << 224n) | (BigInt(forgeId) << 216n) | nameBigInt;
```

We utilized `@noble/hashes/sha3` (`keccak_256`) to ensure fast, pure-JavaScript cryptographic hashing that runs natively in Node.js, browsers, and GitHub Actions without requiring C++ compilation or native toolchains.

## Consequences
- Guaranteed mathematical equivalence with on-chain Drips `RepoDriver.calcAccountId`.
- Enables off-chain pre-computation and verification of repository account identities.
- Seamless compatibility with GitLab and custom Driver instances.
