# Security Policy

## Supported Versions

| Version | Supported          | Notes |
|:---|:---:|:---|
| `1.0.x` / `v1` | :white_check_mark: | Active production release |
| `< 1.0.0` | :x: | Development prototypes |

## Reporting Security Vulnerabilities

If you discover a security vulnerability in DripGuard, please do **NOT** open a public issue.

Instead, please send a report to:
`security@dripguard.dev` or use GitHub's private vulnerability reporting feature.

We commit to acknowledging reports within 48 hours and providing coordinated disclosure timelines.

## Security Model

- **Passive Static Analysis**: DripGuard parses dependency manifests (JSON, YAML, TOML, lockfiles) as passive structured text. It strictly avoids invoking package manager lifecycle scripts (e.g. `npm run`, `cargo build`, `pip install`, `preinstall`, `postinstall`).
- **Least-Privilege GitHub Permissions**: DripGuard operates safely with only `contents: read`. It requests `pull-requests: write` exclusively when automated PR commenting is enabled.
- **Zero Secret Exposure**: Tokens, environment variables, and private keys are never logged to stdout, step summaries, PR comments, or report artifacts.
- **Deterministic Action Bundling**: The GitHub Action runs a hermetic bundle (`dist/action.cjs`) built from audited TypeScript source code and tracked directly in version control. CI verifies bytecode consistency on every commit.

