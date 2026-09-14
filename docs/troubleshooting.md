# Troubleshooting & FAQ

### 1. Why did DripGuard fail on an internal or private package?
By default, DripGuard checks all direct runtime dependencies. For proprietary or in-house packages that do not accept public Drips funding, add an exemption in `.drips.yml`:

```yaml
exceptions:
  allowed_unfunded:
    my-company-internal-core:
      reason: "Internal proprietary package; not eligible for public Drips funding"
```

### 2. A package resolved to the wrong repository. How do I fix it?
Package registries occasionally have ambiguous or outdated repository metadata. Override it using `resolutions` in `.drips.yml`:

```yaml
resolutions:
  npm:
    "@opentelemetry/api":
      github: open-telemetry/opentelemetry-js
```

### 3. Exit code 3: Provider Unavailable
Exit code 3 indicates that DripGuard could not reach the live Drips GraphQL endpoint or package registry. DripGuard strictly refuses to generate synthetic passes when upstream APIs fail.
- Check network connectivity or proxy settings.
- If testing in an isolated or air-gapped environment, use `--mock` to run in deterministic offline demo mode.

### 4. How do I ignore devDependencies?
In `.drips.yml`:
```yaml
dependencies:
  include:
    - runtime
    - direct
  exclude:
    - dev
```
Dev dependencies will be excluded from coverage metrics.
