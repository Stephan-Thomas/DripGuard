import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class NewDependencyRule implements PolicyRule {
  readonly id = 'new_unfunded_dependency';
  readonly description = 'Detects new dependencies added since the baseline that lack verified Drips funding';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    if (!context.baselineDependencies || context.baselineDependencies.length === 0) {
      return violations;
    }

    const baselineSet = new Set(
      context.baselineDependencies.map(d => `${d.dependency.ecosystem}:${d.dependency.name}`)
    );

    const isFail = context.config.policy.fail_on.includes('new_unfunded_dependency');

    for (const depStatus of context.dependencies) {
      const key = `${depStatus.resolvedDependency.dependency.ecosystem}:${depStatus.resolvedDependency.dependency.name}`;
      const isNew = !baselineSet.has(key);

      if (isNew && (depStatus.classification === 'UNFUNDED' || depStatus.classification === 'UNRESOLVED')) {
        const repoStr = depStatus.resolvedDependency.project
          ? `${depStatus.resolvedDependency.project.owner}/${depStatus.resolvedDependency.project.repository}`
          : 'unresolved';

        violations.push({
          rule: this.id,
          severity: isFail ? 'error' : 'warning',
          message: `Newly added dependency "${depStatus.resolvedDependency.dependency.name}" (${repoStr}) lacks verified Drips funding.`,
          dependency: depStatus.resolvedDependency.dependency.name,
          project: repoStr,
          details: {
            ecosystem: depStatus.resolvedDependency.dependency.ecosystem,
            version: depStatus.resolvedDependency.dependency.version,
            classification: depStatus.classification,
            resolutionSource: depStatus.resolvedDependency.resolutionSource
          }
        });
      }
    }

    return violations;
  }
}
