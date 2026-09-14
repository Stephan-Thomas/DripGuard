import {
  ConcentrationMetric,
  CoverageResult,
  DependencyFundingStatus,
  DriftAnalysis,
  DripGuardResult,
  ExitCode,
  FundingClassification,
  FundingSplit,
  PolicyViolation,
  ProjectFunding,
  ProviderMode,
  ResolvedDependency
} from '../core/types.js';
import { DripsConfig } from '../config/schema.js';
import { PolicyContext, PolicyRule } from './types.js';
import { DependencyCoverageRule } from './rules/dependency-coverage.js';
import { NewDependencyRule } from './rules/new-dependency.js';
import { RemovedDependencyRule } from './rules/removed-dependency.js';
import { NoStaleAllocationRule } from './rules/no-stale-allocation.js';
import { MaximumConcentrationRule } from './rules/maximum-concentration.js';
import { RequireFundingForRule } from './rules/require-funding-for.js';
import { UnresolvedDependencyRule } from './rules/unresolved-dependency.js';

export interface EvaluateOptions {
  config: DripsConfig;
  resolvedDependencies: ResolvedDependency[];
  projectFunding?: ProjectFunding;
  baselineDependencies?: ResolvedDependency[];
  providerMode?: ProviderMode;
  repository?: string;
  commitSha?: string;
  executionDurationMs?: number;
}

export class PolicyEngine {
  private readonly rules: PolicyRule[] = [
    new DependencyCoverageRule(),
    new NewDependencyRule(),
    new RemovedDependencyRule(),
    new NoStaleAllocationRule(),
    new MaximumConcentrationRule(),
    new RequireFundingForRule(),
    new UnresolvedDependencyRule()
  ];

  /**
   * Executes policy evaluation against resolved dependencies and funding data.
   */
  evaluate(options: EvaluateOptions): DripGuardResult {
    const { config, resolvedDependencies, projectFunding, baselineDependencies } = options;

    // 1. Filter dependencies based on config include/exclude
    const filteredDeps = this.filterDependencies(resolvedDependencies, config);

    // 2. Classify each dependency
    const dependencyStatuses = this.classifyDependencies(filteredDeps, config, projectFunding);

    // 3. Compute coverage statistics
    const coverage = this.calculateCoverage(dependencyStatuses);

    // 4. Compute funding concentration metrics (splits & streams)
    const concentration = this.calculateConcentration(projectFunding?.splits || []);

    // 5. Compute drift against baseline
    const drift = this.calculateDrift(dependencyStatuses, baselineDependencies);

    // 6. Build policy context
    const context: PolicyContext = {
      config,
      dependencies: dependencyStatuses,
      coverage,
      projectFunding,
      baselineDependencies,
      drift,
      concentration
    };

    // 7. Evaluate all rules
    const allViolations: PolicyViolation[] = [];
    for (const rule of this.rules) {
      const results = rule.evaluate(context);
      allViolations.push(...results);
    }

    const errors = allViolations.filter(v => v.severity === 'error');
    const warnings = allViolations.filter(v => v.severity === 'warning');

    let status: 'pass' | 'fail' | 'warn' = 'pass';
    let exitCode = ExitCode.PASS;

    if (errors.length > 0) {
      status = 'fail';
      exitCode = ExitCode.POLICY_VIOLATION;
    } else if (warnings.length > 0) {
      status = 'warn';
      exitCode = ExitCode.PASS;
    }

    const detectedEcosystems = Array.from(
      new Set(resolvedDependencies.map(d => d.dependency.ecosystem))
    );

    return {
      status,
      exitCode,
      timestamp: new Date().toISOString(),
      repository: options.repository || config.project.github,
      commitSha: options.commitSha,
      detectedEcosystems,
      coverage,
      concentration,
      drift,
      dependencies: dependencyStatuses,
      violations: errors,
      warnings,
      providerMode: options.providerMode || projectFunding?.providerMode || 'DEMO',
      executionDurationMs: options.executionDurationMs || 0
    };
  }

  private filterDependencies(deps: ResolvedDependency[], config: DripsConfig): ResolvedDependency[] {
    const excludes = new Set(config.dependencies.exclude);
    const includes = new Set(config.dependencies.include);

    return deps.filter(d => {
      const dep = d.dependency;
      if (dep.dev && excludes.has('dev') && !includes.has('dev')) {
        return false;
      }
      if (dep.optional && excludes.has('optional')) {
        return false;
      }
      if (!dep.direct && excludes.has('transitive')) {
        return false;
      }
      return true;
    });
  }

  private classifyDependencies(
    deps: ResolvedDependency[],
    config: DripsConfig,
    funding?: ProjectFunding
  ): DependencyFundingStatus[] {
    const fundedProjectKeys = new Map<string, number>();

    if (funding) {
      // Map all receiver projects from splits and dependency routes
      for (const split of funding.splits) {
        if (split.receiverProject) {
          const key = `${split.receiverProject.owner}/${split.receiverProject.repository}`.toLowerCase();
          fundedProjectKeys.set(key, (fundedProjectKeys.get(key) || 0) + split.sharePercent);
        }
      }
      for (const route of funding.routes) {
        const key = `${route.targetProject.owner}/${route.targetProject.repository}`.toLowerCase();
        fundedProjectKeys.set(key, (fundedProjectKeys.get(key) || 0) + route.sharePercent);
      }
      for (const d of funding.dependencies) {
        if (d.isFunded) {
          const key = `${d.project.owner}/${d.project.repository}`.toLowerCase();
          fundedProjectKeys.set(key, (fundedProjectKeys.get(key) || 0) + (d.sharePercent || 1));
        }
      }
    }

    const ignoredProjects = new Set((config.exceptions.ignored_projects || []).map(p => p.toLowerCase()));
    const allowedUnfunded = config.exceptions.allowed_unfunded || {};

    return deps.map(resolvedDep => {
      const pkgName = resolvedDep.dependency.name.toLowerCase();
      const proj = resolvedDep.project;
      const projKey = proj ? `${proj.owner}/${proj.repository}`.toLowerCase() : null;

      // 1. Check explicit package exception
      if (allowedUnfunded[pkgName]) {
        return {
          resolvedDependency: resolvedDep,
          classification: 'EXEMPT',
          exemptionReason: allowedUnfunded[pkgName].reason || 'Configured in allowed_unfunded',
          evidence: 'Explicit maintainer policy exemption'
        };
      }

      // 2. Check ignored project exception
      if (projKey && ignoredProjects.has(projKey)) {
        return {
          resolvedDependency: resolvedDep,
          classification: 'EXEMPT',
          exemptionReason: `Project ${projKey} is in ignored_projects`,
          evidence: 'Explicit project policy exemption'
        };
      }

      // 3. Unresolved dependency
      if (resolvedDep.resolutionStatus !== 'resolved' || !proj) {
        return {
          resolvedDependency: resolvedDep,
          classification: 'UNRESOLVED',
          evidence: resolvedDep.resolutionDetails || 'No canonical repository resolved'
        };
      }

      // 4. Check funding
      const key = `${proj.owner}/${proj.repository}`.toLowerCase();
      const share = fundedProjectKeys.get(key);
      if (share !== undefined && share > 0) {
        return {
          resolvedDependency: resolvedDep,
          classification: 'FUNDED',
          allocatedSharePercent: share,
          evidence: `Verified active Drips funding route (${share.toFixed(1)}% split)`
        };
      }

      return {
        resolvedDependency: resolvedDep,
        classification: 'UNFUNDED',
        evidence: 'No active Drips funding split or stream found for canonical repository'
      };
    });
  }

  private calculateCoverage(statuses: DependencyFundingStatus[]): CoverageResult {
    let total = 0;
    let resolved = 0;
    let funded = 0;
    let partiallyFunded = 0;
    let unfunded = 0;
    let unknown = 0;
    let unresolved = 0;
    let exempt = 0;

    let directTotal = 0;
    let directFunded = 0;

    for (const s of statuses) {
      if (s.classification === 'EXEMPT') {
        exempt++;
        continue;
      }

      total++;
      const isDirect = s.resolvedDependency.dependency.direct;
      if (isDirect) directTotal++;

      if (s.classification === 'FUNDED') {
        funded++;
        resolved++;
        if (isDirect) directFunded++;
      } else if (s.classification === 'PARTIALLY_FUNDED') {
        partiallyFunded++;
        resolved++;
      } else if (s.classification === 'UNFUNDED') {
        unfunded++;
        resolved++;
      } else if (s.classification === 'UNRESOLVED') {
        unresolved++;
      } else {
        unknown++;
      }
    }

    const coveragePercent = total > 0 ? Math.round((funded / total) * 100) : 100;
    const directCoveragePercent = directTotal > 0 ? Math.round((directFunded / directTotal) * 100) : 100;

    return {
      totalDependencies: total,
      resolvedDependencies: resolved,
      fundedDependencies: funded,
      partiallyFundedDependencies: partiallyFunded,
      unfundedDependencies: unfunded,
      unknownDependencies: unknown,
      unresolvedDependencies: unresolved,
      exemptDependencies: exempt,
      coveragePercent,
      directTotal,
      directFunded,
      directCoveragePercent
    };
  }

  private calculateConcentration(splits: FundingSplit[]): ConcentrationMetric {
    if (splits.length === 0) {
      return {
        maxSingleRecipient: { receiver: 'none', sharePercent: 0 },
        herfindahlHirschmanIndex: 0,
        effectiveRecipientsCount: 0
      };
    }

    let maxShare = 0;
    let topSplit = splits[0];
    let sumSquares = 0;

    for (const split of splits) {
      if (split.sharePercent > maxShare) {
        maxShare = split.sharePercent;
        topSplit = split;
      }
      // HHI = sum of (sharePercent)^2
      sumSquares += split.sharePercent * split.sharePercent;
    }

    const hhi = Math.round(sumSquares);
    const effectiveCount = hhi > 0 ? 10000 / hhi : 0;

    return {
      maxSingleRecipient: {
        receiver: topSplit.receiver,
        project: topSplit.receiverProject,
        sharePercent: topSplit.sharePercent
      },
      herfindahlHirschmanIndex: hhi,
      effectiveRecipientsCount: effectiveCount
    };
  }

  private calculateDrift(
    currentStatuses: DependencyFundingStatus[],
    baseline?: ResolvedDependency[]
  ): DriftAnalysis | undefined {
    if (!baseline || baseline.length === 0) {
      return undefined;
    }

    const baselineMap = new Map<string, ResolvedDependency>();
    for (const b of baseline) {
      baselineMap.set(`${b.dependency.ecosystem}:${b.dependency.name}`, b);
    }

    const currentMap = new Map<string, DependencyFundingStatus>();
    for (const c of currentStatuses) {
      currentMap.set(`${c.resolvedDependency.dependency.ecosystem}:${c.resolvedDependency.dependency.name}`, c);
    }

    const added: ResolvedDependency[] = [];
    const newUnfunded: DependencyFundingStatus[] = [];
    for (const [key, status] of currentMap.entries()) {
      if (!baselineMap.has(key)) {
        added.push(status.resolvedDependency);
        if (status.classification === 'UNFUNDED' || status.classification === 'UNRESOLVED') {
          newUnfunded.push(status);
        }
      }
    }

    const removed: ResolvedDependency[] = [];
    for (const [key, bDep] of baselineMap.entries()) {
      if (!currentMap.has(key)) {
        removed.push(bDep);
      }
    }

    return {
      addedDependencies: added,
      removedDependencies: removed,
      newUnfundedDependencies: newUnfunded,
      staleFundingCandidates: [],
      coverageAfter: this.calculateCoverage(currentStatuses).coveragePercent
    };
  }
}
