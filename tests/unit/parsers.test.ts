import { describe, it, expect } from 'vitest';
import { InMemoryRepositoryFileSet } from '../../src/parsers/interface.js';
import { NpmDependencyParser } from '../../src/parsers/npm.js';
import { CargoDependencyParser } from '../../src/parsers/cargo.js';
import { GoDependencyParser } from '../../src/parsers/go.js';
import { PythonDependencyParser } from '../../src/parsers/python.js';
import { defaultParserRegistry } from '../../src/parsers/registry.js';

describe('Dependency Parsers', () => {
  describe('NpmDependencyParser', () => {
    it('parses direct runtime, dev, and optional dependencies from package.json', async () => {
      const files = InMemoryRepositoryFileSet.fromRecord({
        'package.json': JSON.stringify({
          name: 'my-app',
          dependencies: {
            'react': '^18.2.0',
            'zod': '^3.22.0'
          },
          devDependencies: {
            'vitest': '^1.0.0'
          },
          optionalDependencies: {
            'fsevents': '^2.3.3'
          }
        })
      });

      const parser = new NpmDependencyParser();
      expect(parser.detect(files)).toBe(true);

      const res = await parser.parse(files, { includeDev: true, includeOptional: true });
      expect(res.dependencies).toHaveLength(4);

      const react = res.dependencies.find(d => d.name === 'react');
      expect(react).toBeDefined();
      expect(react?.direct).toBe(true);
      expect(react?.dev).toBe(false);
      expect(react?.version).toBe('^18.2.0');

      const vitest = res.dependencies.find(d => d.name === 'vitest');
      expect(vitest?.dev).toBe(true);

      const fsevents = res.dependencies.find(d => d.name === 'fsevents');
      expect(fsevents?.optional).toBe(true);
    });

    it('parses transitive dependencies and locked versions from package-lock.json v2/v3', async () => {
      const files = InMemoryRepositoryFileSet.fromRecord({
        'package.json': JSON.stringify({
          dependencies: { 'express': '^4.18.2' }
        }),
        'package-lock.json': JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { name: 'root' },
            'node_modules/express': { version: '4.18.2' },
            'node_modules/accepts': { version: '1.3.8', dev: false }
          }
        })
      });

      const parser = new NpmDependencyParser();
      const res = await parser.parse(files, { includeTransitive: true });

      const express = res.dependencies.find(d => d.name === 'express');
      expect(express?.version).toBe('4.18.2'); // refined from lockfile

      const accepts = res.dependencies.find(d => d.name === 'accepts');
      expect(accepts).toBeDefined();
      expect(accepts?.direct).toBe(false);
    });
  });

  describe('CargoDependencyParser', () => {
    it('parses Cargo.toml and Cargo.lock', async () => {
      const files = InMemoryRepositoryFileSet.fromRecord({
        'Cargo.toml': `
          [package]
          name = "my-crate"
          version = "0.1.0"

          [dependencies]
          serde = "1.0"
          tokio = { version = "1.28", features = ["full"] }

          [dev-dependencies]
          criterion = "0.5"
        `,
        'Cargo.lock': `
          version = 3

          [[package]]
          name = "serde"
          version = "1.0.197"
          source = "registry+https://github.com/rust-lang/crates.io-index"

          [[package]]
          name = "serde_derive"
          version = "1.0.197"
          source = "registry+https://github.com/rust-lang/crates.io-index"
        `
      });

      const parser = new CargoDependencyParser();
      expect(parser.detect(files)).toBe(true);

      const res = await parser.parse(files, { includeDev: true, includeTransitive: true });
      expect(res.dependencies.length).toBeGreaterThanOrEqual(3);

      const serde = res.dependencies.find(d => d.name === 'serde');
      expect(serde?.direct).toBe(true);
      expect(serde?.version).toBe('1.0.197'); // locked version

      const tokio = res.dependencies.find(d => d.name === 'tokio');
      expect(tokio?.direct).toBe(true);

      const criterion = res.dependencies.find(d => d.name === 'criterion');
      expect(criterion?.dev).toBe(true);

      const serdeDerive = res.dependencies.find(d => d.name === 'serde_derive');
      expect(serdeDerive?.direct).toBe(false);
    });
  });

  describe('GoDependencyParser', () => {
    it('parses go.mod and identifies direct vs indirect dependencies', async () => {
      const files = InMemoryRepositoryFileSet.fromRecord({
        'go.mod': `
          module github.com/example/project

          go 1.22

          require (
            github.com/gin-gonic/gin v1.9.1
            go.uber.org/zap v1.26.0
            golang.org/x/sync v0.6.0 // indirect
          )
        `
      });

      const parser = new GoDependencyParser();
      expect(parser.detect(files)).toBe(true);

      const res = await parser.parse(files, { includeTransitive: true });
      expect(res.dependencies).toHaveLength(3);

      const gin = res.dependencies.find(d => d.name === 'github.com/gin-gonic/gin');
      expect(gin?.direct).toBe(true);
      expect(gin?.version).toBe('v1.9.1');

      const sync = res.dependencies.find(d => d.name === 'golang.org/x/sync');
      expect(sync?.direct).toBe(false);
    });
  });

  describe('PythonDependencyParser', () => {
    it('parses requirements.txt and pyproject.toml', async () => {
      const files = InMemoryRepositoryFileSet.fromRecord({
        'requirements.txt': `
          # Primary runtime dependencies
          requests>=2.28.0
          pydantic==2.5.0
        `,
        'requirements-dev.txt': `
          pytest>=7.4.0
        `,
        'pyproject.toml': `
          [project]
          dependencies = [
            "httpx>=0.24.0",
          ]
        `
      });

      const parser = new PythonDependencyParser();
      expect(parser.detect(files)).toBe(true);

      const res = await parser.parse(files, { includeDev: true });
      expect(res.dependencies.length).toBeGreaterThanOrEqual(3);

      const req = res.dependencies.find(d => d.name === 'requests');
      expect(req?.direct).toBe(true);
      expect(req?.dev).toBe(false);

      const pytest = res.dependencies.find(d => d.name === 'pytest');
      expect(pytest?.dev).toBe(true);

      const httpx = res.dependencies.find(d => d.name === 'httpx');
      expect(httpx).toBeDefined();
    });
  });

  describe('ParserRegistry Multi-Ecosystem', () => {
    it('detects multiple ecosystems in a polyglot repository', async () => {
      const files = InMemoryRepositoryFileSet.fromRecord({
        'package.json': JSON.stringify({ dependencies: { 'react': '18.0.0' } }),
        'Cargo.toml': '[dependencies]\nserde = "1.0"',
        'go.mod': 'module test\nrequire github.com/stretchr/testify v1.8.0',
        'requirements.txt': 'requests==2.0'
      });

      const detected = defaultParserRegistry.detectEcosystems(files);
      expect(detected).toContain('npm');
      expect(detected).toContain('cargo');
      expect(detected).toContain('go');
      expect(detected).toContain('pypi');

      const all = await defaultParserRegistry.parseAll(files);
      expect(all.dependencies).toHaveLength(4);
    });
  });
});
