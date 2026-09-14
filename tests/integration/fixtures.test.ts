import { describe, it, expect } from 'vitest';
import { runDripGuard } from '../../src/index.js';
import { MockDripsFundingProvider } from '../../src/drips/mock-provider.js';
import { LiveDripsFundingProvider } from '../../src/drips/live-provider.js';
import { DripsConfigSchema } from '../../src/config/schema.js';
import { ExitCode, ResolvedDependency } from '../../src/core/types.js';
import { PolicyEngine } from '../../src/policy/engine.js';

describe('Integration Test Fixtures (A through G)', () => {
  const baseConfig = DripsConfigSchema.parse({
    project: { github: 'acme/project' },
    funding: {
      minimum_dependency_coverage: 90,
      max_single_recipient_share: 70,
      max_concentration_hhi: 5000
    },
    policy: {
      fail_on: ['new_unfunded_dependency', 'insufficient_coverage', 'concentration'],
      warn_on: ['stale_funding', 'unresolved_dependency']
    }
  });

  // Helper to create resolved dependency mock
  function createDep(name: string, owner: string, repo: string, status: 'resolved' | 'unknown' = 'resolved'): ResolvedDependency {
    return {
      dependency: { name, ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
      project: status === 'resolved' ? { forge: 'github', owner, repository: repo, url: `https://github.com/${owner}/${repo}` } : undefined,
      resolutionStatus: status,
      resolutionSource: status === 'resolved' ? 'heuristic' : 'unresolved'
    };
  }

  // Fixture A — Fully funded
  it('Fixture A: Fully funded dependencies pass evaluation (PASS)', async () => {
    const deps = [
      createDep('react', 'facebook', 'react'),
      createDep('zod', 'colinhacks', 'zod')
    ];

    const provider = new MockDripsFundingProvider({
      splits: {
        'acme/project': [
          { receiverRepo: 'facebook/react', weight: 500, sharePercent: 50 },
          { receiverRepo: 'colinhacks/zod', weight: 500, sharePercent: 50 }
        ]
      }
    });

    const proj = await provider.resolveProject({ forge: 'github', owner: 'acme', repository: 'project' });
    const funding = await provider.getProjectFunding(proj!);

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: deps,
      projectFunding: funding
    });

    expect(res.status).toBe('pass');
    expect(res.exitCode).toBe(ExitCode.PASS);
    expect(res.coverage.coveragePercent).toBe(100);
    expect(res.violations).toHaveLength(0);
  });

  // Fixture B — New unfunded dependency
  it('Fixture B: Newly added unfunded dependency triggers policy failure (FAIL)', async () => {
    const baselineDeps = [
      createDep('react', 'facebook', 'react'),
      createDep('zod', 'colinhacks', 'zod')
    ];

    // Developer added opentelemetry, which lacks verified funding
    const currentDeps = [
      ...baselineDeps,
      createDep('@opentelemetry/api', 'open-telemetry', 'opentelemetry-js')
    ];

    const provider = new MockDripsFundingProvider({
      splits: {
        'acme/project': [
          { receiverRepo: 'facebook/react', weight: 500, sharePercent: 50 },
          { receiverRepo: 'colinhacks/zod', weight: 500, sharePercent: 50 }
        ]
      }
    });

    const proj = await provider.resolveProject({ forge: 'github', owner: 'acme', repository: 'project' });
    const funding = await provider.getProjectFunding(proj!);

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: currentDeps,
      baselineDependencies: baselineDeps,
      projectFunding: funding
    });

    expect(res.status).toBe('fail');
    expect(res.exitCode).toBe(ExitCode.POLICY_VIOLATION);
    // Coverage dropped from 100% to 67% (2 out of 3)
    expect(res.coverage.coveragePercent).toBe(67);

    const newDepViolation = res.violations.find(v => v.rule === 'new_unfunded_dependency');
    expect(newDepViolation).toBeDefined();
    expect(newDepViolation?.dependency).toBe('@opentelemetry/api');
  });

  // Fixture C — Unresolved package
  it('Fixture C: Unresolved package surfaces warning/error without fake resolution', async () => {
    const deps = [
      createDep('obscure-unregistered-private-pkg', '', '', 'unknown')
    ];

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: deps
    });

    // Policy has warn_on: ['unresolved_dependency']
    const unresolvedWarn = res.warnings.find(w => w.rule === 'unresolved_dependency');
    expect(unresolvedWarn).toBeDefined();
    expect(unresolvedWarn?.dependency).toBe('obscure-unregistered-private-pkg');
    expect(res.coverage.unresolvedDependencies).toBe(1);
  });

  // Fixture D — Concentration violation
  it('Fixture D: Excessive funding concentration triggers policy failure (FAIL)', async () => {
    const deps = [
      createDep('react', 'facebook', 'react'),
      createDep('zod', 'colinhacks', 'zod')
    ];

    const provider = new MockDripsFundingProvider({
      splits: {
        'acme/project': [
          // Single recipient gets 85% > 70% threshold
          { receiverRepo: 'facebook/react', weight: 850, sharePercent: 85 },
          { receiverRepo: 'colinhacks/zod', weight: 150, sharePercent: 15 }
        ]
      }
    });

    const proj = await provider.resolveProject({ forge: 'github', owner: 'acme', repository: 'project' });
    const funding = await provider.getProjectFunding(proj!);

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: deps,
      projectFunding: funding
    });

    expect(res.status).toBe('fail');
    const concentrationViolation = res.violations.find(v => v.rule === 'max_single_recipient_share');
    expect(concentrationViolation).toBeDefined();
    expect(concentrationViolation?.message).toContain('85.0%');
  });

  // Fixture E — Stale funding
  it('Fixture E: Funding for removed dependency triggers STALE FUNDING warning', async () => {
    // Current codebase depends only on zod
    const currentDeps = [
      createDep('zod', 'colinhacks', 'zod')
    ];

    // But funding splits still direct 50% to react (leftover)
    const provider = new MockDripsFundingProvider({
      splits: {
        'acme/project': [
          { receiverRepo: 'colinhacks/zod', weight: 500, sharePercent: 50 },
          { receiverRepo: 'facebook/react', weight: 500, sharePercent: 50 }
        ]
      }
    });

    const proj = await provider.resolveProject({ forge: 'github', owner: 'acme', repository: 'project' });
    const funding = await provider.getProjectFunding(proj!);

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: currentDeps,
      projectFunding: funding
    });

    const staleWarn = res.warnings.find(w => w.rule === 'stale_funding');
    expect(staleWarn).toBeDefined();
    expect(staleWarn?.message).toContain('STALE FUNDING CANDIDATE');
    expect(staleWarn?.project).toBe('facebook/react');
  });

  // Fixture F — Provider unavailable
  it('Fixture F: External provider outage returns explicit UNAVAILABLE status, NOT fake pass (Rule: No fake live data)', async () => {
    const provider = new MockDripsFundingProvider({
      simulateOutage: true
    });

    await expect(
      provider.resolveProject({ forge: 'github', owner: 'acme', repository: 'project' })
    ).rejects.toThrow('Simulated Drips provider network outage');
  });

  // Fixture G — Mock mode
  it('Fixture G: Mock provider results are explicitly tagged DEMO mode', async () => {
    const provider = new MockDripsFundingProvider();
    expect(provider.mode).toBe('DEMO');

    const proj = await provider.resolveProject({ forge: 'github', owner: 'acme', repository: 'project' });
    const funding = await provider.getProjectFunding(proj!);
    expect(funding.providerMode).toBe('DEMO');

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: [],
      projectFunding: funding
    });

    expect(res.providerMode).toBe('DEMO');
  });
});
