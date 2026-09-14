import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class DependencyCoverageRule implements PolicyRule {
  readonly id = 'minimum_dependency_coverage';
  readonly description = 'Verifies that repository dependency funding coverage satisfies the configured minimum threshold';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const minOverall = context.config.funding.minimum_dependency_coverage;
    const actualOverall = context.coverage.coveragePercent;

    const isFail = context.config.policy.fail_on.includes('insufficient_coverage') ||
                   context.config.policy.fail_on.includes('minimum_dependency_coverage');

    if (actualOverall < minOverall) {
      violations.push({
        rule: this.id,
        severity: isFail ? 'error' : 'warning',
        message: `Dependency coverage is ${actualOverall}%, which is below the configured minimum of ${minOverall}%.`,
        details: {
          actualCoverage: actualOverall,
          requiredCoverage: minOverall,
          totalDependencies: context.coverage.totalDependencies,
          fundedDependencies: context.coverage.fundedDependencies,
          unfundedDependencies: context.coverage.unfundedDependencies
        }
      });
    }

    const minDirect = context.config.funding.minimum_direct_dependency_coverage;
    if (minDirect !== undefined && context.coverage.directCoveragePercent < minDirect) {
      violations.push({
        rule: 'minimum_direct_dependency_coverage',
        severity: isFail ? 'error' : 'warning',
        message: `Direct dependency coverage is ${context.coverage.directCoveragePercent}%, which is below the configured minimum of ${minDirect}%.`,
        details: {
          actualCoverage: context.coverage.directCoveragePercent,
          requiredCoverage: minDirect,
          directTotal: context.coverage.directTotal,
          directFunded: context.coverage.directFunded
        }
      });
    }

    return violations;
  }
}
