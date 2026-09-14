import { describe, it, expect } from 'vitest';
import { normalizeRepositoryUrl } from '../../src/resolution/normalizer.js';
import { DependencyResolver } from '../../src/resolution/resolver.js';
import { DripsConfigSchema } from '../../src/config/schema.js';

describe('Canonical Project Resolution', () => {
  describe('normalizeRepositoryUrl', () => {
    it('normalizes various GitHub URL formats into CanonicalProject', () => {
      const urls = [
        'https://github.com/colinhacks/zod',
        'https://github.com/colinhacks/zod.git',
        'git+https://github.com/colinhacks/zod.git',
        'git@github.com:colinhacks/zod.git',
        'colinhacks/zod',
        'github:colinhacks/zod'
      ];

      for (const u of urls) {
        const proj = normalizeRepositoryUrl(u);
        expect(proj).toBeDefined();
        expect(proj?.forge).toBe('github');
        expect(proj?.owner).toBe('colinhacks');
        expect(proj?.repository).toBe('zod');
        expect(proj?.url).toBe('https://github.com/colinhacks/zod');
      }
    });

    it('strips repository subpaths (e.g. tree/main)', () => {
      const proj = normalizeRepositoryUrl('https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/api');
      expect(proj?.owner).toBe('open-telemetry');
      expect(proj?.repository).toBe('opentelemetry-js');
    });

    it('returns null for invalid or unparseable URLs', () => {
      expect(normalizeRepositoryUrl('')).toBeNull();
      expect(normalizeRepositoryUrl('https://example.com/not-a-forge')).toBeNull();
    });
  });

  describe('DependencyResolver', () => {
    it('resolves packages via well-known open source dictionary', async () => {
      const resolver = new DependencyResolver();
      const res = await resolver.resolve({
        name: 'zod',
        ecosystem: 'npm',
        direct: true,
        dev: false,
        optional: false,
        sourceFile: 'package.json'
      });

      expect(res.resolutionStatus).toBe('resolved');
      expect(res.project).toEqual({
        forge: 'github',
        owner: 'colinhacks',
        repository: 'zod',
        url: 'https://github.com/colinhacks/zod'
      });
      expect(res.resolutionSource).toBe('heuristic');
    });

    it('resolves Go import paths directly', async () => {
      const resolver = new DependencyResolver();
      const res = await resolver.resolve({
        name: 'github.com/gin-gonic/gin',
        ecosystem: 'go',
        direct: true,
        dev: false,
        optional: false,
        sourceFile: 'go.mod'
      });

      expect(res.resolutionStatus).toBe('resolved');
      expect(res.project?.owner).toBe('gin-gonic');
      expect(res.project?.repository).toBe('gin');
      expect(res.resolutionSource).toBe('manifest');
    });

    it('prioritizes manual resolution overrides from .drips.yml', async () => {
      const config = DripsConfigSchema.parse({
        project: { github: 'my-org/my-app' },
        resolutions: {
          npm: {
            'custom-internal-pkg': {
              github: 'custom-org/custom-repo'
            }
          }
        }
      });

      const resolver = new DependencyResolver({ config });
      const res = await resolver.resolve({
        name: 'custom-internal-pkg',
        ecosystem: 'npm',
        direct: true,
        dev: false,
        optional: false,
        sourceFile: 'package.json'
      });

      expect(res.resolutionStatus).toBe('resolved');
      expect(res.project?.owner).toBe('custom-org');
      expect(res.project?.repository).toBe('custom-repo');
      expect(res.resolutionSource).toBe('manual_override');
    });

    it('returns unknown status when package cannot be mapped without guessing', async () => {
      const resolver = new DependencyResolver({ allowNetwork: false });
      const res = await resolver.resolve({
        name: 'totally-unheard-of-proprietary-package-12345',
        ecosystem: 'npm',
        direct: true,
        dev: false,
        optional: false,
        sourceFile: 'package.json'
      });

      expect(res.resolutionStatus).toBe('unknown');
      expect(res.project).toBeUndefined();
      expect(res.resolutionDetails).toContain('No verified canonical repository mapping found');
    });
  });
});
