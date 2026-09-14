import path from 'node:path';
import {
  CanonicalProject,
  CoverageResult,
  Dependency,
  DripGuardResult,
  DripsDependency,
  DripsProject,
  ExitCode,
  FundingAmount,
  FundingClassification,
  FundingRoute,
  FundingSplit,
  FundingStream,
  PolicyViolation,
  ProjectFunding,
  ProviderMode,
  ResolutionSource,
  ResolutionStatus,
  ResolvedDependency
} from './core/types.js';
import { loadConfig } from './config/loader.js';
import { DripsConfig } from './config/schema.js';
import { FileSystemRepositoryFileSet } from './parsers/interface.js';
import { defaultParserRegistry, ParserRegistry } from './parsers/registry.js';
import { DependencyResolver } from './resolution/resolver.js';
import { DripsFundingProvider } from './drips/interface.js';
import { LiveDripsFundingProvider } from './drips/live-provider.js';
import { MockDripsFundingProvider } from './drips/mock-provider.js';
import { calcAccountId } from './drips/repodriver.js';
import { PolicyEngine } from './policy/engine.js';
import { BaselineManager, DEFAULT_BASELINE_FILE } from './baseline/manager.js';

export * from './core/types.js';
export * from './config/schema.js';
export * from './config/loader.js';
export * from './parsers/interface.js';
export * from './parsers/registry.js';
export * from './parsers/npm.js';
export * from './parsers/cargo.js';
export * from './parsers/go.js';
export * from './parsers/python.js';
export * from './resolution/normalizer.js';
export * from './resolution/resolver.js';
export * from './drips/interface.js';
export * from './drips/repodriver.js';
export * from './drips/live-provider.js';
export * from './drips/mock-provider.js';
export * from './policy/types.js';
export * from './policy/engine.js';
export * from './baseline/manager.js';
export * from './reporting/terminal.js';
export * from './reporting/json.js';
export * from './reporting/sarif.js';
export * from './reporting/markdown.js';

export interface RunDripGuardOptions {
  repoRoot?: string;
  configPath?: string;
  config?: DripsConfig;
  provider?: 'live' | 'mock' | DripsFundingProvider;
  baselinePath?: string;
  baseline?: ResolvedDependency[];
  allowNetwork?: boolean;
  verbose?: boolean;
}

/**
 * Programmatic entry point to run DripGuard against a repository.
 */
export async function runDripGuard(options: RunDripGuardOptions = {}): Promise<DripGuardResult> {
  const startTime = Date.now();
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : process.cwd();

  // 1. Load configuration
  let config = options.config;
  if (!config) {
    const loaded = loadConfig(repoRoot, options.configPath);
    config = loaded.config;
  }

  // 2. Discover dependencies across supported ecosystems
  const fileSet = new FileSystemRepositoryFileSet(repoRoot);
  const includeDev = config.dependencies.include.includes('dev');
  const includeTransitive = config.dependencies.include.includes('transitive');
  const includeOptional = !config.dependencies.exclude.includes('optional');

  const parsed = await defaultParserRegistry.parseAll(fileSet, {
    includeDev,
    includeTransitive,
    includeOptional,
    allowedEcosystems: config.dependencies.ecosystems
  });

  // 3. Resolve canonical projects
  const allowNetwork = options.allowNetwork ?? (options.provider !== 'mock');
  const resolver = new DependencyResolver({
    allowNetwork,
    config
  });
  const resolved = await resolver.resolveAll(parsed.dependencies);

  // 4. Resolve baseline (if present)
  let baseline = options.baseline;
  if (!baseline) {
    const candidateBaselineFile = options.baselinePath
      ? (path.isAbsolute(options.baselinePath) ? options.baselinePath : path.join(repoRoot, options.baselinePath))
      : path.join(repoRoot, DEFAULT_BASELINE_FILE);

    const baselineData = BaselineManager.loadBaseline(candidateBaselineFile);
    if (baselineData) {
      baseline = BaselineManager.toResolvedDependencies(baselineData);
    }
  }

  // 5. Initialize Drips provider (Default is LIVE; mock is explicitly opt-in)
  let provider: DripsFundingProvider;
  if (typeof options.provider === 'object' && options.provider !== null) {
    provider = options.provider;
  } else if (options.provider === 'mock') {
    // Explicit opt-in mock provider
    const defaultFunded = resolved
      .filter(r => r.project && !r.dependency.name.includes('unfunded') && !r.dependency.name.includes('opentelemetry'))
      .map(r => `${r.project!.owner}/${r.project!.repository}`);

    provider = new MockDripsFundingProvider({
      fundedRepos: defaultFunded
    });
  } else {
    // Default in production is LIVE
    provider = new LiveDripsFundingProvider();
  }

  // 6. Query Drips funding data
  let projectFunding: ProjectFunding | undefined;
  const projectParts = config.project.github.split('/');
  if (projectParts.length === 2) {
    try {
      const dripsProj = await provider.resolveProject({
        forge: 'github',
        owner: projectParts[0],
        repository: projectParts[1]
      });

      if (dripsProj) {
        projectFunding = await provider.getProjectFunding(dripsProj);
      }
    } catch (err: unknown) {
      if (provider.mode === 'LIVE') {
        // Return UNAVAILABLE result without throwing uncaught
        return {
          status: 'error',
          exitCode: ExitCode.PROVIDER_UNAVAILABLE,
          timestamp: new Date().toISOString(),
          repository: config.project.github,
          detectedEcosystems: parsed.detectedEcosystems,
          coverage: {
            totalDependencies: resolved.length,
            resolvedDependencies: 0,
            fundedDependencies: 0,
            partiallyFundedDependencies: 0,
            unfundedDependencies: 0,
            unknownDependencies: 0,
            unresolvedDependencies: 0,
            exemptDependencies: 0,
            coveragePercent: 0,
            directTotal: 0,
            directFunded: 0,
            directCoveragePercent: 0
          },
          dependencies: [],
          violations: [
            {
              rule: 'provider_availability',
              severity: 'error',
              message: `Drips provider unavailable: ${err instanceof Error ? err.message : String(err)}`
            }
          ],
          warnings: [],
          providerMode: 'UNAVAILABLE',
          executionDurationMs: Date.now() - startTime
        };
      }
    }
  }

  // 7. Policy evaluation
  const policyEngine = new PolicyEngine();
  return policyEngine.evaluate({
    config,
    resolvedDependencies: resolved,
    projectFunding,
    baselineDependencies: baseline,
    providerMode: provider.mode,
    repository: config.project.github,
    executionDurationMs: Date.now() - startTime
  });
}
