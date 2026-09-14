import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class RequireFundingForRule implements PolicyRule {
  readonly id = 'require_funding_for';
  readonly description = 'Enforces 100% funding coverage for explicitly required dependency categories (direct, runtime)';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const includes = context.config.dependencies.include;
    const requireDirect = includes.includes('direct');
    const requireRuntime = includes.includes('runtime');

    const isFail = context.config.policy.fail_on.includes('require_funding_for') ||
                   context.config.policy.fail_on.includes('new_unfunded_dependency') ||
                   context.config.policy.fail_on.includes('insufficient_coverage');

    for (const dep of context.dependencies) {
      if (dep.classification === 'EXEMPT') continue;

      const isDirect = dep.resolvedDependency.dependency.direct;
      const isRuntime = !dep.resolvedDependency.dependency.dev;

      const mustFund = (requireDirect && isDirect) || (requireRuntime && isRuntime);

      if (mustFund && (dep.classification === 'UNFUNDED' || dep.classification === 'UNRESOLVED')) {
        const repoStr = dep.resolvedDependency.project
          ? `${dep.resolvedDependency.project.owner}/${dep.resolvedDependency.project.repository}`
          : 'unresolved';

        violations.push({
          rule: this.id,
          severity: isFail ? 'error' : 'warning',
          message: `Required funding rule violated: ${isDirect ? 'Direct' : 'Runtime'} dependency "${dep.resolvedDependency.dependency.name}" (${repoStr}) has no verified funding.`,
          dependency: dep.resolvedDependency.dependency.name,
          project: repoStr,
          details: {
            direct: isDirect,
            runtime: isRuntime,
            classification: dep.classification
          }
        });
      }
    }

    return violations;
  }
}
