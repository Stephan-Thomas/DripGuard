### Issue #13: `feat: persistent canonical project resolution cache across CI invocations`

- **Labels**: `enhancement`, `performance`, `ci`
- **Status**: Backlog / Future Enhancement

#### Problem
In large enterprise repositories with hundreds of dependencies, querying online package registries (npm, crates.io, PyPI) to resolve canonical GitHub repositories can introduce latency and risk upstream registry HTTP rate limits (e.g. 429 Too Many Requests) across frequent CI runs.

#### Proposed Solution
1. Introduce a structured resolution cache format (`.dripguard-cache.json`) storing verified mappings:
   ```json
   {
     "version": 1,
     "entries": {
       "npm:@opentelemetry/api": {
         "repo": "open-telemetry/opentelemetry-js",
         "resolvedAt": "2026-09-14T12:00:00Z",
         "hash": "sha256-..."
       }
     }
   }
   ```
2. Integrate with GitHub Actions cache (`@actions/cache`):
   - Automatically restore and save `.dripguard-cache.json` between workflow runs using cache keys based on dependency lockfile hashes.
3. Add CLI flags `--cache-dir <path>` and `--no-cache` to control local persistence.

#### Acceptance Criteria
- [ ] Sub-second CI resolution time on warm cache hits.
- [ ] Cryptographic checksum verification to detect stale or invalid cache entries.
- [ ] Automatic cache eviction for entries older than a configurable TTL (default 30 days).
- [ ] Complete offline capability when run with a pre-populated cache file.

#### Testing Requirements
- Benchmarks comparing cold vs warm resolution times across 500+ dependency fixtures.
