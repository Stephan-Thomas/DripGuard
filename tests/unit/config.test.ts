import { describe, it, expect } from 'vitest';
import { parseConfig, generateDefaultConfig, ConfigurationError } from '../../src/config/loader.js';

describe('Configuration Loader & Schema', () => {
  it('parses valid .drips.yml with custom settings', () => {
    const yaml = `
      version: 1
      project:
        github: "my-org/my-project"
      funding:
        minimum_dependency_coverage: 85
        max_single_recipient_share: 60
      exceptions:
        allowed_unfunded:
          - internal-pkg
      resolutions:
        npm:
          special-lib:
            github: special/lib
    `;

    const config = parseConfig(yaml);
    expect(config.project.github).toBe('my-org/my-project');
    expect(config.funding.minimum_dependency_coverage).toBe(85);
    expect(config.funding.max_single_recipient_share).toBe(60);
    expect(config.exceptions.allowed_unfunded['internal-pkg']).toBeDefined();
    expect(config.resolutions.npm['special-lib']?.repo).toBe('special/lib');
  });

  it('supports allowed_unfunded object format with reasons', () => {
    const yaml = `
      version: 1
      project:
        github: "org/repo"
      exceptions:
        allowed_unfunded:
          helper-lib:
            reason: "Non-profit foundation project funded off-chain"
    `;

    const config = parseConfig(yaml);
    expect(config.exceptions.allowed_unfunded['helper-lib'].reason).toBe(
      'Non-profit foundation project funded off-chain'
    );
  });

  it('throws ConfigurationError on invalid YAML syntax', () => {
    const badYaml = `
      version: 1
      project: [unclosed array
    `;

    expect(() => parseConfig(badYaml)).toThrow(ConfigurationError);
  });

  it('throws ConfigurationError with validation details on schema mismatch', () => {
    const invalidConfig = `
      version: 1
      project:
        github: "" # empty string violates min(1)
      funding:
        minimum_dependency_coverage: 150 # exceeds max 100
    `;

    expect(() => parseConfig(invalidConfig)).toThrow(ConfigurationError);
  });

  it('generates well-structured starter default config', () => {
    const generated = generateDefaultConfig({
      github: 'Stephan-Thomas/DripGuard',
      ecosystems: ['npm', 'cargo'],
      minimumCoverage: 95
    });

    expect(generated).toContain('github: Stephan-Thomas/DripGuard');
    expect(generated).toContain('minimum_dependency_coverage: 95');

    // Verify generated default YAML is itself valid
    const parsed = parseConfig(generated);
    expect(parsed.project.github).toBe('Stephan-Thomas/DripGuard');
    expect(parsed.funding.minimum_dependency_coverage).toBe(95);
  });
});
