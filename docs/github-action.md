# GitHub Action Integration

DripGuard provides a native GitHub Action to automate funding drift verification directly inside CI workflows and Pull Requests.

---

## Example Workflow (`.github/workflows/dripguard.yml`)

```yaml
name: DripGuard Funding Drift Check

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write # Required only if comment: true is enabled

jobs:
  check-funding:
    name: Verify Funding Alignment
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run DripGuard Check
        uses: Stephan-Thomas/DripGuard@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          provider: 'mock' # Use 'live' for real on-chain queries
          comment: 'true'
          summary: 'true'
          format: 'text'
```

---

## Action Inputs

| Input | Description | Default |
|:---|:---|:---|
| `github-token` | Token for updating pull request comments | `${{ github.token }}` |
| `config` | Path to `.drips.yml` configuration file | `.drips.yml` |
| `baseline` | Path to baseline file for diff mode | `.dripguard-baseline.json` |
| `provider` | Provider mode (`live` or `mock`) | `mock` |
| `comment` | Update a persistent comment on PRs | `true` |
| `summary` | Write report to `$GITHUB_STEP_SUMMARY` | `true` |
| `format` | Output report format (`text`, `json`, `sarif`) | `text` |
| `working-directory` | Directory path of the repository | `.` |

---

## Action Outputs

| Output | Description |
|:---|:---|
| `status` | Overall result status (`pass`, `fail`, `warn`) |
| `coverage-percent` | Current verified funding coverage percentage |
| `violations-count` | Number of policy violations detected |
| `unfunded-count` | Number of unfunded dependencies |
| `report-path` | Absolute path to generated JSON report |

---

## Least-Privilege Security Model
- **No Elevated Privileges**: DripGuard only requests `pull-requests: write` when PR comments are enabled.
- **Read-Only Alternative**: Maintainers can set `comment: false` and grant only `contents: read`. The full report will still appear inside the GitHub Actions Step Summary!
- **Persistent Comments**: Uses `<!-- dripguard-report -->` to update the same comment across commits, preventing spam.
