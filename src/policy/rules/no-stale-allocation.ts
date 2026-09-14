import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class NoStaleAllocationRule implements PolicyRule {
  readonly id = 'stale_funding';
  readonly description = 'Detects project funding splits or streams directed toward projects no longer in the active dependency graph';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    if (!context.projectFunding || !context.projectFunding.splits || context.projectFunding.splits.length === 0) {
      return violations;
    }

    // Set of all canonical projects currently depended on (as "owner/repo" in lower case)
    const activeProjectKeys = new Set<string>();

    // Include the project itself so self-funding or root splits aren't flagged as stale
    if (context.config.project.github) {
      activeProjectKeys.add(context.config.project.github.toLowerCase());
    }

    for (const dep of context.dependencies) {
      if (dep.resolvedDependency.project) {
        const key = `${dep.resolvedDependency.project.owner}/${dep.resolvedDependency.project.repository}`.toLowerCase();
        activeProjectKeys.add(key);
      }
    }

    const isFail = context.config.policy.fail_on.includes('stale_funding');

    for (const split of context.projectFunding.splits) {
      if (split.receiverProject) {
        const key = `${split.receiverProject.owner}/${split.receiverProject.repository}`.toLowerCase();
        if (!activeProjectKeys.has(key)) {
          violations.push({
            rule: this.id,
            severity: isFail ? 'error' : 'warning',
            message: `STALE FUNDING CANDIDATE: Project receives a ${split.sharePercent.toFixed(1)}% split, but is not present in the current dependency graph.`,
            project: `${split.receiverProject.owner}/${split.receiverProject.repository}`,
            details: {
              sharePercent: split.sharePercent,
              weight: split.weight,
              receiver: split.receiver,
              explanation: `The project "${split.receiverProject.owner}/${split.receiverProject.repository}" is configured to receive funding splits from your Drips account, but no software package in this repository currently depends on it. Maintainers should review whether this funding allocation is intentional or leftover.`
            }
          });
        }
      }
    }

    return violations;
  }
}
