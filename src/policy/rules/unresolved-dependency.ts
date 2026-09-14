import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class UnresolvedDependencyRule implements PolicyRule {
  readonly id = 'unresolved_dependency';
  readonly description = 'Flags dependencies that could not be mapped to a canonical repository forge';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const isFail = context.config.policy.fail_on.includes('unresolved_dependency');

    for (const dep of context.dependencies) {
      if (dep.classification === 'EXEMPT') continue;

      if (dep.resolvedDependency.resolutionStatus === 'unknown' || dep.resolvedDependency.resolutionStatus === 'ambiguous') {
        violations.push({
          rule: this.id,
          severity: isFail ? 'error' : 'warning',
          message: `Unresolved dependency "${dep.resolvedDependency.dependency.name}": ${dep.resolvedDependency.resolutionDetails || 'No canonical repository mapping found.'}`,
          dependency: dep.resolvedDependency.dependency.name,
          details: {
            ecosystem: dep.resolvedDependency.dependency.ecosystem,
            resolutionStatus: dep.resolvedDependency.resolutionStatus,
            suggestedAction: `Add an entry under 'resolutions.${dep.resolvedDependency.dependency.ecosystem}.${dep.resolvedDependency.dependency.name}' in .drips.yml`
          }
        });
      }
    }

    return violations;
  }
}
