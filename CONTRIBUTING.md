# Contributing to DripGuard

Thank you for your interest in contributing to DripGuard!

## Development Workflow

### Prerequisites
- Node.js >= 18
- pnpm >= 9

### Setup
```bash
# Clone the repository
git clone https://github.com/Stephan-Thomas/DripGuard.git
cd DripGuard

# Install dependencies
pnpm install

# Run unit and integration tests
pnpm test

# Run typecheck
pnpm typecheck

# Build the project
pnpm build
```

## Adding a New Ecosystem Parser
1. Create a new parser in `src/parsers/<ecosystem>.ts` implementing the `DependencyParser` interface.
2. Register the parser in `src/parsers/registry.ts`.
3. Add corresponding test fixtures in `tests/unit/parsers.test.ts`.

## Commit Guidelines
We adhere to Conventional Commits:
- `feat:` New features
- `fix:` Bug fixes
- `test:` Test suites and fixtures
- `docs:` Documentation and ADRs
- `refactor:` Code improvements without behavioral changes
