# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in DripGuard, please do **NOT** open a public issue.

Instead, please send a report to:
`security@dripguard.dev` or use GitHub's private vulnerability reporting feature.

## Security Model
- **Untrusted Manifests**: DripGuard parses dependency manifests (JSON, YAML, TOML, lockfiles) as passive text data. It strictly avoids invoking package manager lifecycle scripts (e.g. `preinstall`, `postinstall`).
- **Least-Privilege GitHub Token**: DripGuard requires only `contents: read` for verification and `pull-requests: write` exclusively when automated PR commenting is enabled.
- **Zero Secret Exposure**: Tokens, environment variables, and private keys are never printed to terminal logs, step summaries, or PR comments.
