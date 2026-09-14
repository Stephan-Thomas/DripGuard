### Issue #12: `feat: package manager parsers for Composer (PHP) and Bundler (Ruby)`

- **Labels**: `enhancement`, `parsers`, `ecosystems`
- **Status**: Backlog / Future Enhancement

#### Problem
DripGuard currently supports JavaScript/TypeScript (`npm`, `yarn`, `pnpm`), Rust (`Cargo`), Go (`go.mod`), and Python (`pip`, `poetry`). Major open-source web ecosystems like PHP (Laravel, Symfony, WordPress) and Ruby (Rails, Sinatra) represent thousands of open-source projects using Drips that need automated funding drift verification.

#### Proposed Solution
1. Implement `ComposerParser`:
   - Parse `composer.json` (direct `require` vs `require-dev`).
   - Parse `composer.lock` for exact package versions and source repository metadata.
   - Map Packagist vendor/name coordinates to canonical GitHub repositories.
2. Implement `BundlerParser`:
   - Parse `Gemfile` (direct dependencies, group scoping: `production` vs `development`).
   - Parse `Gemfile.lock` for locked dependency tree.
   - Query RubyGems API or built-in dictionary for canonical source code repository links.

#### Acceptance Criteria
- [ ] Static, safe parsing without executing PHP or Ruby binaries.
- [ ] Differentiates runtime from dev/test dependencies.
- [ ] Normalizes GitHub repository links from Packagist and RubyGems metadata.
- [ ] Included in `defaultParserRegistry`.

#### Testing Requirements
- Unit tests with fixture `composer.json`, `composer.lock`, `Gemfile`, and `Gemfile.lock`.
