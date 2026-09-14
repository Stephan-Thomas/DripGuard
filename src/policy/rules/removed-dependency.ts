import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class RemovedDependencyRule implements PolicyRule {
  readonly id = 'removed_dependency';
  readonly description = 'Tracks dependencies removed since baseline to highlight potentially stale funding allocations';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    if (!context.baselineDependencies || context.baselineDependencies.length === 0) {
      return violations;
    }

    const currentSet = new Set(
      context.dependencies.map(d => `${d.resolvedDependency.dependency.ecosystem}:${d.resolvedDependency.dependency.name}`)
    );

    const isFail = context.config.policy.fail_on.includes('removed_dependency');

    for (const bDep of context.baselineDependencies) {
      const key = `${bDep.dependency.ecosystem}:${bDep.dependency.name}`;
      if (!currentSet.has(key)) {
        const repoStr = bDep.project ? `${bDep.project.owner}/${bDep.project.repository}` : undefined;
        violations.push({
          rule: this.id,
          severity: isFail ? 'error' : 'warning',
          message: `Dependency "${bDep.dependency.name}" was removed from the codebase. Review whether ongoing funding should be reallocated.`,
          dependency: bDep.dependency.name,
          project: repoStr,
          details: {
            ecosystem: bDep.dependency.ecosystem,
            previousVersion: bDep.dependency.version
          }
        });
      }
    }

    return violations;
  }
}
