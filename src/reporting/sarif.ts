import { DripGuardResult } from '../core/types.js';

/**
 * Formats DripGuard results into SARIF 2.1.0 JSON format for GitHub code scanning.
 */
export function formatSarifReport(result: DripGuardResult): string {
  const rules = [
    {
      id: 'minimum_dependency_coverage',
      shortDescription: { text: 'Funding coverage below policy threshold' },
      defaultConfiguration: { level: 'error' }
    },
    {
      id: 'new_unfunded_dependency',
      shortDescription: { text: 'New dependency added without verified funding' },
      defaultConfiguration: { level: 'error' }
    },
    {
      id: 'stale_funding',
      shortDescription: { text: 'Funding allocated to project no longer depended on' },
      defaultConfiguration: { level: 'warning' }
    },
    {
      id: 'concentration',
      shortDescription: { text: 'Funding concentration exceeds policy threshold' },
      defaultConfiguration: { level: 'warning' }
    },
    {
      id: 'unresolved_dependency',
      shortDescription: { text: 'Dependency could not be mapped to a canonical project' },
      defaultConfiguration: { level: 'warning' }
    }
  ];

  const allItems = [...result.violations, ...result.warnings];
  const sarifResults = allItems.map(item => {
    // Attempt to locate source file for dependency
    const depStatus = item.dependency
      ? result.dependencies.find(d => d.resolvedDependency.dependency.name === item.dependency)
      : undefined;

    const uri = depStatus?.resolvedDependency.dependency.sourceFile || 'package.json';

    return {
      ruleId: item.rule,
      level: item.severity === 'error' ? 'error' : 'warning',
      message: {
        text: item.message
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: uri.replace(/^\//, '')
            },
            region: {
              startLine: 1,
              startColumn: 1
            }
          }
        }
      ]
    };
  });

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'DripGuard',
            version: '0.1.0',
            informationUri: 'https://github.com/Stephan-Thomas/DripGuard',
            rules
          }
        },
        results: sarifResults
      }
    ]
  };

  return JSON.stringify(sarif, null, 2);
}
