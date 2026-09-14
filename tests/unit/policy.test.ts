import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/policy/engine.js';
import { DripsConfigSchema } from '../../src/config/schema.js';
import { ResolvedDependency, ProjectFunding } from '../../src/core/types.js';

describe('Policy Engine & Rules', () => {
  const baseConfig = DripsConfigSchema.parse({
    project: { github: 'example/project' },
    funding: {
      minimum_dependency_coverage: 90,
      max_single_recipient_share: 70,
      max_concentration_hhi: 2500
    },
    policy: {
      fail_on: ['new_unfunded_dependency', 'insufficient_coverage', 'concentration'],
      warn_on: ['stale_funding', 'unresolved_dependency']
    }
  });

  it('evaluates 100% coverage as PASS', () => {
    const deps: ResolvedDependency[] = [
      {
        dependency: { name: 'react', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
        project: { forge: 'github', owner: 'facebook', repository: 'react', url: 'https://github.com/facebook/react' },
        resolutionStatus: 'resolved',
        resolutionSource: 'heuristic'
      }
    ];

    const funding: ProjectFunding = {
      project: { id: '1', forge: 'github', owner: 'example', repo: 'project', url: '', accountId: '123', claimed: true },
      splits: [
        {
          receiver: '456',
          receiverProject: { forge: 'github', owner: 'facebook', repository: 'react', url: 'https://github.com/facebook/react' },
          weight: 1000,
          sharePercent: 100
        }
      ],
      streams: [],
      dependencies: [],
      routes: [],
      totalReceived: [],
      providerMode: 'DEMO',
      lastUpdated: new Date().toISOString()
    };

    const engine = new PolicyEngine();
    // Allow single recipient 100% in config for this test
    const customConfig = { ...baseConfig, funding: { ...baseConfig.funding, max_single_recipient_share: 100, max_concentration_hhi: 10000 } };
    const res = engine.evaluate({
      config: customConfig,
      resolvedDependencies: deps,
      projectFunding: funding
    });

    expect(res.status).toBe('pass');
    expect(res.coverage.coveragePercent).toBe(100);
    expect(res.violations).toHaveLength(0);
  });

  it('detects insufficient coverage violation when coverage drops below minimum threshold', () => {
    const deps: ResolvedDependency[] = [
      {
        dependency: { name: 'react', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
        project: { forge: 'github', owner: 'facebook', repository: 'react', url: '' },
        resolutionStatus: 'resolved',
        resolutionSource: 'heuristic'
      },
      {
        dependency: { name: 'zod', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
        project: { forge: 'github', owner: 'colinhacks', repository: 'zod', url: '' },
        resolutionStatus: 'resolved',
        resolutionSource: 'heuristic'
      }
    ];

    // Funding only covers React (50% coverage vs 90% required)
    const funding: ProjectFunding = {
      project: { id: '1', forge: 'github', owner: 'example', repo: 'project', url: '', accountId: '123', claimed: true },
      splits: [
        { receiver: '456', receiverProject: { forge: 'github', owner: 'facebook', repository: 'react', url: '' }, weight: 1000, sharePercent: 100 }
      ],
      streams: [],
      dependencies: [],
      routes: [],
      totalReceived: [],
      providerMode: 'DEMO',
      lastUpdated: new Date().toISOString()
    };

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: deps,
      projectFunding: funding
    });

    expect(res.status).toBe('fail');
    expect(res.coverage.coveragePercent).toBe(50);
    const covViolation = res.violations.find(v => v.rule === 'minimum_dependency_coverage');
    expect(covViolation).toBeDefined();
    expect(covViolation?.message).toContain('below the configured minimum of 90%');
  });

  it('honors policy exceptions in allowed_unfunded with maintainer reason', () => {
    const configWithException = DripsConfigSchema.parse({
      project: { github: 'example/project' },
      funding: { minimum_dependency_coverage: 100 },
      exceptions: {
        allowed_unfunded: {
          'internal-helper': {
            reason: 'Private testing utility not eligible for Drips funding'
          }
        }
      }
    });

    const deps: ResolvedDependency[] = [
      {
        dependency: { name: 'internal-helper', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
        project: { forge: 'github', owner: 'example', repository: 'internal-helper', url: '' },
        resolutionStatus: 'resolved',
        resolutionSource: 'heuristic'
      }
    ];

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: configWithException,
      resolvedDependencies: deps
    });

    expect(res.status).toBe('pass');
    expect(res.coverage.exemptDependencies).toBe(1);
    expect(res.dependencies[0].classification).toBe('EXEMPT');
    expect(res.dependencies[0].exemptionReason).toBe('Private testing utility not eligible for Drips funding');
  });

  it('calculates Herfindahl-Hirschman Index and detects concentration violation', () => {
    const funding: ProjectFunding = {
      project: { id: '1', forge: 'github', owner: 'example', repo: 'project', url: '', accountId: '123', claimed: true },
      splits: [
        // One project receives 90% -> HHI = 90^2 + 10^2 = 8100 + 100 = 8200 (way above 2500)
        { receiver: '1', receiverProject: { forge: 'github', owner: 'heavy', repository: 'pkg', url: '' }, weight: 900, sharePercent: 90 },
        { receiver: '2', receiverProject: { forge: 'github', owner: 'small', repository: 'pkg', url: '' }, weight: 100, sharePercent: 10 }
      ],
      streams: [],
      dependencies: [],
      routes: [],
      totalReceived: [],
      providerMode: 'DEMO',
      lastUpdated: new Date().toISOString()
    };

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: [],
      projectFunding: funding
    });

    expect(res.concentration?.herfindahlHirschmanIndex).toBe(8200);
    const concentrationViolation = res.violations.find(v => v.rule === 'max_single_recipient_share' || v.rule === 'max_concentration_hhi');
    expect(concentrationViolation).toBeDefined();
  });

  it('detects STALE FUNDING CANDIDATE when funding allocates to a project not in dependencies', () => {
    const deps: ResolvedDependency[] = [
      {
        dependency: { name: 'react', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
        project: { forge: 'github', owner: 'facebook', repository: 'react', url: '' },
        resolutionStatus: 'resolved',
        resolutionSource: 'heuristic'
      }
    ];

    const funding: ProjectFunding = {
      project: { id: '1', forge: 'github', owner: 'example', repo: 'project', url: '', accountId: '123', claimed: true },
      splits: [
        { receiver: '1', receiverProject: { forge: 'github', owner: 'facebook', repository: 'react', url: '' }, weight: 500, sharePercent: 50 },
        // Stale split: left over from an old abandoned dependency
        { receiver: '2', receiverProject: { forge: 'github', owner: 'old-org', repository: 'abandoned-tool', url: '' }, weight: 500, sharePercent: 50 }
      ],
      streams: [],
      dependencies: [],
      routes: [],
      totalReceived: [],
      providerMode: 'DEMO',
      lastUpdated: new Date().toISOString()
    };

    const engine = new PolicyEngine();
    const res = engine.evaluate({
      config: baseConfig,
      resolvedDependencies: deps,
      projectFunding: funding
    });

    const staleWarning = res.warnings.find(w => w.rule === 'stale_funding');
    expect(staleWarning).toBeDefined();
    expect(staleWarning?.message).toContain('STALE FUNDING CANDIDATE');
    expect(staleWarning?.project).toBe('old-org/abandoned-tool');
  });
});
