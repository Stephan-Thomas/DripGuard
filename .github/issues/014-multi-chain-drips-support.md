### Issue #14: `feat: multi-chain Drips network aggregation (Arbitrum, Polygon, and custom L2s)`

- **Labels**: `enhancement`, `drips`, `multi-chain`
- **Status**: Backlog / Future Enhancement

#### Problem
The Drips protocol is expanding beyond Ethereum Mainnet and Optimism to high-throughput, low-fee networks like Base, Arbitrum One, and Polygon. Open-source projects may configure primary splits on Base while receiving recurring streaming donations on Ethereum Mainnet. Currently, evaluation targets a single default chain or GraphQL endpoint, which can overlook cross-chain allocations.

#### Proposed Solution
1. Extend `DripsConfigSchema` to support multi-chain configuration:
   ```yaml
   drips:
     chains:
       - name: ethereum
         chain_id: 1
       - name: optimism
         chain_id: 10
       - name: base
         chain_id: 8453
   ```
2. Enhance `LiveDripsFundingProvider` to aggregate multi-chain splits and streams:
   - Query project balances, splits, and streams across all configured networks.
   - Aggregate effective weights and compute normalized multi-chain coverage metrics.
   - Present network breakdown badges in Markdown reports and Step Summaries.

#### Acceptance Criteria
- [ ] Aggregated funding view combining streams and splits across multiple chains.
- [ ] Robust per-chain error boundaries: failure on one secondary RPC does not fail overall evaluation if primary endpoint responds.
- [ ] Clear chain attribution in PR comments and Step Summaries.

#### Testing Requirements
- Multi-chain mock fixtures verifying aggregation math and per-chain error handling.
