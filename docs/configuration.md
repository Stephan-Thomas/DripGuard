# Configuration Reference (`.drips.yml`)

DripGuard uses a single declarative `.drips.yml` (or `.drips.yaml`) file at your repository root. The file is validated using a strict Zod schema.

---

## Full Configuration Schema

```yaml
version: 1

# Canonical project identity
project:
  # The GitHub owner/repository of this project
  github: owner/repository
  forge: github # 'github' or 'gitlab'

# Dependency scope configuration
dependencies:
  # Categories to include in coverage checks
  include:
    - runtime
    - direct
    # - dev
    # - transitive

  # Categories explicitly excluded
  exclude:
    - dev
    - optional

  # Restrict evaluation to specific ecosystems (optional)
  # ecosystems:
  #   - npm
  #   - cargo

# Funding rules and thresholds
funding:
  # Minimum percentage of dependencies with verified Drips funding (0-100)
  minimum_dependency_coverage: 90

  # Strict threshold for direct dependencies (optional)
  minimum_direct_dependency_coverage: 100

  # Maximum percentage share directed to any single recipient (0-100)
  max_single_recipient_share: 70

  # Maximum Herfindahl-Hirschman Index (0-10000)
  max_concentration_hhi: 2500

# Rule severity mapping
policy:
  # Violations that trigger CLI exit code 1 / CI failure
  fail_on:
    - new_unfunded_dependency
    - insufficient_coverage
    - concentration

  # Warnings surfaced in PR comments and terminal output without failing CI
  warn_on:
    - stale_funding
    - unresolved_dependency

# Maintainer exemptions
exceptions:
  # Packages explicitly permitted to remain unfunded
  allowed_unfunded:
    # Option 1: Array of package names
    # - internal-tools
    # Option 2: Key-value map with maintainer explanation
    internal-tools:
      reason: "In-house package not eligible for public Drips funding"

  # Projects excluded from coverage and drift checks
  ignored_projects:
    - owner/private-repo

# Manual package-to-repository resolution mappings
resolutions:
  npm:
    "@opentelemetry/api":
      github: open-telemetry/opentelemetry-js
  cargo:
    my-crate:
      github: my-org/my-crate-repo
  pypi:
    my-lib:
      github: my-org/my-lib

# Output and CI options
output:
  comment_on_pull_request: true
  create_summary: true
  format: text # 'text', 'json', or 'sarif'
```

---

## Validation
Validate your configuration anytime with:
```bash
npx dripguard validate
```
Or specify an explicit configuration path:
```bash
npx dripguard check --config custom-drips.yml
```
