import { describe, it, expect } from 'vitest';
import { formatTerminalReport } from '../../src/reporting/terminal.js';
import { formatJsonReport } from '../../src/reporting/json.js';
import { formatSarifReport } from '../../src/reporting/sarif.js';
import { formatMarkdownReport, PR_COMMENT_ANCHOR } from '../../src/reporting/markdown.js';
import { DripGuardResult, ExitCode } from '../../src/core/types.js';

describe('Reporting and Formatters', () => {
  const sampleResult: DripGuardResult = {
    status: 'fail',
    exitCode: ExitCode.POLICY_VIOLATION,
    timestamp: '2026-09-14T10:00:00.000Z',
    repository: 'Stephan-Thomas/DripGuard',
    commitSha: 'abcdef1234567890',
    detectedEcosystems: ['npm', 'cargo'],
    coverage: {
      totalDependencies: 10,
      resolvedDependencies: 10,
      fundedDependencies: 8,
      partiallyFundedDependencies: 0,
      unfundedDependencies: 2,
      unknownDependencies: 0,
      unresolvedDependencies: 0,
      exemptDependencies: 0,
      coveragePercent: 80,
      directTotal: 6,
      directFunded: 5,
      directCoveragePercent: 83
    },
    concentration: {
      maxSingleRecipient: {
        receiver: '0x123',
        project: { forge: 'github', owner: 'heavy', repository: 'dep', url: 'https://github.com/heavy/dep' },
        sharePercent: 75
      },
      herfindahlHirschmanIndex: 5800,
      effectiveRecipientsCount: 1.7
    },
    drift: {
      addedDependencies: [
        {
          dependency: { name: 'opentelemetry', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
          project: { forge: 'github', owner: 'open-telemetry', repository: 'opentelemetry-js', url: 'https://github.com/open-telemetry/opentelemetry-js' },
          resolutionStatus: 'resolved',
          resolutionSource: 'heuristic'
        }
      ],
      removedDependencies: [],
      newUnfundedDependencies: [
        {
          resolvedDependency: {
            dependency: { name: 'opentelemetry', ecosystem: 'npm', direct: true, dev: false, optional: false, sourceFile: 'package.json' },
            project: { forge: 'github', owner: 'open-telemetry', repository: 'opentelemetry-js', url: 'https://github.com/open-telemetry/opentelemetry-js' },
            resolutionStatus: 'resolved',
            resolutionSource: 'heuristic'
          },
          classification: 'UNFUNDED',
          evidence: 'No verified Drips route'
        }
      ],
      staleFundingCandidates: [],
      coverageAfter: 80
    },
    dependencies: [],
    violations: [
      {
        rule: 'minimum_dependency_coverage',
        severity: 'error',
        message: 'Coverage is 80%, below required minimum of 90%'
      }
    ],
    warnings: [
      {
        rule: 'stale_funding',
        severity: 'warning',
        message: 'STALE FUNDING CANDIDATE: old-dep receives split but is not in manifests'
      }
    ],
    providerMode: 'DEMO',
    executionDurationMs: 42
  };

  it('formats terminal output with metrics, violations, and color highlights', () => {
    const term = formatTerminalReport(sampleResult);
    expect(term).toContain('DripGuard Funding Linter');
    expect(term).toContain('Stephan-Thomas/DripGuard');
    expect(term).toContain('80%');
    expect(term).toContain('Policy Violations (1)');
    expect(term).toContain('minimum_dependency_coverage');
    expect(term).toContain('Result: FAIL');
  });

  it('formats JSON report conforming to report schema envelope', () => {
    const jsonStr = formatJsonReport(sampleResult);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.$schema).toContain('report-v1.json');
    expect(parsed.tool.name).toBe('DripGuard');
    expect(parsed.coverage.coveragePercent).toBe(80);
    expect(parsed.violations).toHaveLength(1);
  });

  it('formats SARIF 2.1.0 output valid for GitHub code scanning', () => {
    const sarifStr = formatSarifReport(sampleResult);
    const parsed = JSON.parse(sarifStr);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].tool.driver.name).toBe('DripGuard');
    expect(parsed.runs[0].results.length).toBeGreaterThanOrEqual(1);
    expect(parsed.runs[0].results[0].ruleId).toBe('minimum_dependency_coverage');
  });

  it('formats PR Markdown report containing the persistent update anchor', () => {
    const md = formatMarkdownReport(sampleResult);
    expect(md).toContain(PR_COMMENT_ANCHOR);
    expect(md).toContain('## 💧 DripGuard Funding Health Report');
    expect(md).toContain('Overall Coverage');
    expect(md).toContain('80%');
    expect(md).toContain('opentelemetry');
    expect(md).toContain('Policy Violations');
  });
});
