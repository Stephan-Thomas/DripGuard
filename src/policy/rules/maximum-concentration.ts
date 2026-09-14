import { PolicyRule, PolicyContext } from '../types.js';
import { PolicyViolation } from '../../core/types.js';

export class MaximumConcentrationRule implements PolicyRule {
  readonly id = 'concentration';
  readonly description = 'Detects excessive funding concentration among recipients via maximum single share and Herfindahl-Hirschman Index (HHI)';

  evaluate(context: PolicyContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    if (!context.concentration) return violations;

    const maxShareConfig = context.config.funding.max_single_recipient_share ?? 70;
    const maxHHIConfig = context.config.funding.max_concentration_hhi ?? 2500;

    const isFail = context.config.policy.fail_on.includes('concentration') ||
                   context.config.policy.fail_on.includes('max_single_recipient_share');

    // 1. Single recipient share check
    const topRecipient = context.concentration.maxSingleRecipient;
    if (topRecipient.sharePercent > maxShareConfig) {
      const projName = topRecipient.project
        ? `${topRecipient.project.owner}/${topRecipient.project.repository}`
        : topRecipient.receiver;

      violations.push({
        rule: 'max_single_recipient_share',
        severity: isFail ? 'error' : 'warning',
        message: `Recipient "${projName}" receives ${topRecipient.sharePercent.toFixed(1)}% of total funding, exceeding the maximum allowed share of ${maxShareConfig}%.`,
        project: topRecipient.project ? `${topRecipient.project.owner}/${topRecipient.project.repository}` : undefined,
        details: {
          recipient: projName,
          sharePercent: topRecipient.sharePercent,
          maxAllowedShare: maxShareConfig
        }
      });
    }

    // 2. Herfindahl-Hirschman Index (HHI) check
    // HHI is calculated as the sum of squared percentage shares: HHI = Σ (s_i)^2, where s_i ∈ [0, 100].
    // An HHI > 2500 indicates a highly concentrated allocation according to antitrust / portfolio standards.
    if (context.concentration.herfindahlHirschmanIndex > maxHHIConfig) {
      violations.push({
        rule: 'max_concentration_hhi',
        severity: isFail ? 'error' : 'warning',
        message: `Funding concentration index (HHI: ${Math.round(context.concentration.herfindahlHirschmanIndex)}) exceeds threshold of ${maxHHIConfig}. Effective recipient diversity is only ${context.concentration.effectiveRecipientsCount.toFixed(1)} projects.`,
        details: {
          hhi: context.concentration.herfindahlHirschmanIndex,
          maxHHI: maxHHIConfig,
          effectiveRecipients: context.concentration.effectiveRecipientsCount,
          formula: 'HHI = Σ (share_percent_i)^2'
        }
      });
    }

    return violations;
  }
}
