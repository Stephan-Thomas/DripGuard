# Changelog

All notable changes to DripGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-14

### Added
- **GitHub Marketplace Release**: Hardened and certified for GitHub Marketplace v1.0.0 with official branding (`shield`, `blue`).
- **Self-Contained Action Bundle**: Zero-install standalone bundle `dist/action.cjs` compiled via `esbuild` for Node 20 runners.
- **CI Dist Consistency Guard**: Automatic CI verification preventing unbundled drift between TypeScript source and distribution bytecode.
- **Production Provider Isolation**: Action metadata and CLI default to `live` Drips network queries. Mock mode is strictly opt-in for testing.
- **Strict "No Fake Live Data"**: Live network failures return exit code 3 (`PROVIDER_UNAVAILABLE`) with explicit errors rather than falling back to mocks or fabricating synthetic token valuations.
- **Stablecoin Valuation Engine**: Token amounts are formatted according to on-chain decimals, and USD valuations are computed only for verified 1:1 USD stablecoins (DAI, USDC, USDT).
- **Least-Privilege Security**: Action defaults to pure read-only (`contents: read`), reserving `pull-requests: write` exclusively when PR commenting is requested.

## [0.1.0] - 2026-09-14

### Added
- Multi-ecosystem static dependency discovery for `npm`, `Cargo`, `Go`, and `Python` (supporting manifests and lockfiles).
- Canonical project resolution pipeline separating Package Identity, Repository Identity, and Drips Identity.
- Drips protocol client implementing exact on-chain `RepoDriver.calcAccountId` derivation.
- Live GraphQL Drips funding provider and deterministic offline Mock provider with strict "No Fake Live Data" guarantees.
- Deterministic policy engine supporting coverage thresholds, drift detection, stale allocation candidates, concentration HHI, and scoped funding requirements.
- CLI application providing `check`, `diff`, `dependencies`, `funding`, `explain`, `init`, and `validate` commands.
- Standardized, machine-readable exit codes (0 = Pass, 1 = Policy Violation, 2 = Config Error, 3 = Provider Unavailable, 4 = Fatal).
- GitHub Action integration with least-privilege permissions, single persistent PR comment updates, and Step Summaries.
- Comprehensive documentation, 6 Architecture Decision Records (ADR), and extensive test suite (100% passing).
