# Output Formats & Exit Codes

DripGuard supports human-friendly terminal UX, machine-readable JSON, SARIF 2.1.0, and Markdown for CI.

---

## Standardized Exit Codes

DripGuard produces deterministic, machine-friendly exit codes:

| Exit Code | Meaning | Description |
|:---:|:---|:---|
| `0` | **PASS** | All dependencies satisfy configured funding policies. |
| `1` | **POLICY_VIOLATION** | One or more policy rules failed (e.g. coverage below threshold, new unfunded dependency). |
| `2` | **CONFIGURATION_ERROR** | `.drips.yml` missing, invalid YAML syntax, or schema validation failed. |
| `3` | **PROVIDER_UNAVAILABLE** | Upstream Drips network or registry query failed (no fake fallback). |
| `4` | **INTERNAL_ERROR** | Fatal unexpected runtime exception. |

---

## Output Formats

### 1. Terminal Output (`--format text`)
Default interactive output with colored indicators, metrics, and actionable diagnostics.

### 2. JSON Output (`--format json`)
Structured JSON conforming to `$schema: https://dripguard.dev/schemas/report-v1.json`:
```json
{
  "$schema": "https://dripguard.dev/schemas/report-v1.json",
  "tool": {
    "name": "DripGuard",
    "version": "0.1.0"
  },
  "status": "fail",
  "exitCode": 1,
  "coverage": {
    "totalDependencies": 24,
    "resolvedDependencies": 22,
    "fundedDependencies": 19,
    "unfundedDependencies": 3,
    "coveragePercent": 86
  },
  "violations": [
    {
      "rule": "minimum_dependency_coverage",
      "severity": "error",
      "message": "Dependency coverage is 86%, below minimum 90%."
    }
  ]
}
```

### 3. SARIF 2.1.0 Output (`--format sarif`)
Enables direct ingestion into GitHub Code Scanning and security dashboards. Violations point to exact lines in package manifests.
