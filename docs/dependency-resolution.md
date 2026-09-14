# Canonical Dependency Resolution

Raw package identifiers (e.g. `@opentelemetry/api`, `tokio`, `requests`) do not correspond 1:1 with code repositories or Drips on-chain accounts.

DripGuard separates these concepts into three explicit models:
1. **Package Identity**: Declared in package manifests.
2. **Repository Identity**: Canonical code forge coordinates (`owner/repository` on GitHub or GitLab).
3. **Drips Project Identity**: Deterministic on-chain account ID computed via `RepoDriver.calcAccountId`.

---

## The Resolution Pipeline

```text
Package in Manifest
       ↓
[Manual Override in .drips.yml]
       ↓ (if not found)
[Direct Forge Import (e.g. Go module path)]
       ↓ (if not found)
[Canonical Open Source Dictionary]
       ↓ (if not found)
[Ecosystem Registry Metadata (npm, crates.io, PyPI)]
       ↓ (if not found)
Classification: UNRESOLVED (Status: 'unknown')
```

### Resolution Statuses
- `resolved`: Successfully mapped to a single canonical repository forge.
- `ambiguous`: Multiple conflicting repository sources found.
- `unknown`: No canonical repository mapping could be verified.
- `unsupported`: Hosted on an unsupported platform or private registry.

---

## Manual Overrides
When DripGuard encounters a proprietary or unusually-packaged dependency, it flags it as `unknown` rather than guessing. Maintainers provide manual mappings under `resolutions` in `.drips.yml`:

```yaml
resolutions:
  npm:
    "@org/sub-package":
      github: org/monorepo-core
  cargo:
    internal-crate:
      github: org/crates-workspace
```
