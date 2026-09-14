import pc from 'picocolors';
import { DripGuardResult } from '../core/types.js';

export function formatTerminalReport(result: DripGuardResult, verbose: boolean = false): string {
  const lines: string[] = [];

  // Header banner
  lines.push('');
  lines.push(pc.bold(pc.cyan('💧 DripGuard Funding Linter')));
  lines.push(pc.dim('Continuous verification between software dependencies and Drips funding'));
  lines.push('');

  // Repository & Environment info
  lines.push(pc.bold('Repository: ') + pc.white(result.repository) + (result.commitSha ? pc.dim(` (${result.commitSha.substring(0, 7)})`) : ''));
  lines.push(pc.bold('Provider Mode: ') + formatProviderMode(result.providerMode));
  lines.push(pc.bold('Detected Ecosystems: ') + result.detectedEcosystems.map(e => pc.cyan(e)).join(', '));
  lines.push('');

  // Dependency summary
  lines.push(pc.bold('Dependency Analysis:'));
  lines.push(`  ${pc.green('✓')} ${result.coverage.totalDependencies} applicable dependencies discovered`);
  lines.push(`  ${pc.green('✓')} ${result.coverage.resolvedDependencies} dependencies mapped to canonical projects`);
  lines.push(`  ${pc.green('✓')} ${result.coverage.fundedDependencies} funding relationships verified on Drips`);
  if (result.coverage.exemptDependencies > 0) {
    lines.push(`  ${pc.dim('ℹ')} ${result.coverage.exemptDependencies} dependencies exempt by policy`);
  }
  lines.push('');

  // Coverage block
  const covPercent = result.coverage.coveragePercent;
  const covColor = covPercent >= 90 ? pc.green : (covPercent >= 75 ? pc.yellow : pc.red);
  lines.push(pc.bold('Funding Coverage:'));
  lines.push(`  Overall:  ${covColor(pc.bold(`${covPercent}%`))} (${result.coverage.fundedDependencies}/${result.coverage.totalDependencies} funded)`);
  if (result.coverage.directTotal > 0) {
    const dirPercent = result.coverage.directCoveragePercent;
    const dirColor = dirPercent >= 90 ? pc.green : (dirPercent >= 75 ? pc.yellow : pc.red);
    lines.push(`  Direct:   ${dirColor(`${dirPercent}%`)} (${result.coverage.directFunded}/${result.coverage.directTotal} funded)`);
  }
  lines.push('');

  // Drift Analysis (if present)
  if (result.drift) {
    lines.push(pc.bold('Funding Drift vs Baseline:'));
    if (result.drift.addedDependencies.length > 0) {
      lines.push(pc.yellow(`  + ${result.drift.addedDependencies.length} newly added dependencies`));
      for (const d of result.drift.addedDependencies.slice(0, 5)) {
        lines.push(pc.dim(`    + ${d.dependency.name} (${d.dependency.ecosystem})`));
      }
      if (result.drift.addedDependencies.length > 5) {
        lines.push(pc.dim(`    ... and ${result.drift.addedDependencies.length - 5} more`));
      }
    }
    if (result.drift.removedDependencies.length > 0) {
      lines.push(pc.cyan(`  - ${result.drift.removedDependencies.length} dependencies removed`));
    }
    if (result.drift.newUnfundedDependencies.length > 0) {
      lines.push(pc.red(`  ✗ ${result.drift.newUnfundedDependencies.length} new dependencies lack verified funding`));
    }
    lines.push('');
  }

  // Concentration (if present)
  if (result.concentration && result.concentration.maxSingleRecipient.sharePercent > 0) {
    lines.push(pc.bold('Funding Allocation & Diversity:'));
    const top = result.concentration.maxSingleRecipient;
    const topName = top.project ? `${top.project.owner}/${top.project.repository}` : top.receiver;
    lines.push(`  Top Recipient: ${pc.cyan(topName)} (${top.sharePercent.toFixed(1)}% share)`);
    lines.push(`  Diversity Index (HHI): ${result.concentration.herfindahlHirschmanIndex} (effective: ~${result.concentration.effectiveRecipientsCount.toFixed(1)} recipients)`);
    lines.push('');
  }

  // Violations block
  if (result.violations.length > 0) {
    lines.push(pc.bold(pc.red(`Policy Violations (${result.violations.length}):`)));
    for (const v of result.violations) {
      lines.push(`  ${pc.red('✗')} ${pc.bold(v.rule)}: ${v.message}`);
    }
    lines.push('');
  }

  // Warnings block
  if (result.warnings.length > 0) {
    lines.push(pc.bold(pc.yellow(`Warnings (${result.warnings.length}):`)));
    for (const w of result.warnings) {
      lines.push(`  ${pc.yellow('⚠')} ${pc.bold(w.rule)}: ${w.message}`);
    }
    lines.push('');
  }

  // Detailed dependencies listing if verbose
  if (verbose) {
    lines.push(pc.bold('All Evaluated Dependencies:'));
    for (const dep of result.dependencies) {
      const cls = dep.classification;
      const badge = cls === 'FUNDED' ? pc.green('[FUNDED]') :
                    cls === 'EXEMPT' ? pc.blue('[EXEMPT]') :
                    cls === 'PARTIALLY_FUNDED' ? pc.yellow('[PARTIAL]') :
                    cls === 'UNRESOLVED' ? pc.magenta('[UNRESOLVED]') :
                    pc.red('[UNFUNDED]');
      const repo = dep.resolvedDependency.project ? `${dep.resolvedDependency.project.owner}/${dep.resolvedDependency.project.repository}` : 'unknown';
      lines.push(`  ${badge} ${dep.resolvedDependency.dependency.name} -> ${repo}`);
    }
    lines.push('');
  }

  // Final Result line
  if (result.status === 'pass') {
    lines.push(pc.bold(pc.green('Result: PASS')) + pc.dim(` (evaluated in ${result.executionDurationMs}ms)`));
  } else if (result.status === 'warn') {
    lines.push(pc.bold(pc.yellow('Result: PASS (with warnings)')) + pc.dim(` (evaluated in ${result.executionDurationMs}ms)`));
  } else {
    lines.push(pc.bold(pc.red('Result: FAIL — Policy violations detected.')));
  }
  lines.push('');

  return lines.join('\n');
}

function formatProviderMode(mode: string): string {
  switch (mode) {
    case 'LIVE': return pc.green('LIVE (verified against on-chain Drips network)');
    case 'DEMO': return pc.yellow('DEMO / MOCK (offline deterministic fixtures)');
    case 'PARTIAL': return pc.yellow('PARTIAL (some endpoints reachable)');
    case 'UNAVAILABLE': return pc.red('UNAVAILABLE (network/provider failure)');
    default: return mode;
  }
}
