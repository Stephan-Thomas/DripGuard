import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'yaml';

describe('Dist & Marketplace Artifact Consistency', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const actionYmlPath = path.join(rootDir, 'action.yml');
  const distActionPath = path.join(rootDir, 'dist/action.cjs');

  it('action.yml exists and has valid metadata for GitHub Marketplace', () => {
    expect(fs.existsSync(actionYmlPath)).toBe(true);
    const content = fs.readFileSync(actionYmlPath, 'utf-8');
    const doc = yaml.parse(content);

    expect(doc.name).toBe('DripGuard');
    expect(doc.description).toBeDefined();
    expect(doc.description.length).toBeLessThanOrEqual(120);
    expect(doc.branding).toBeDefined();
    expect(doc.branding.icon).toBe('shield');
    expect(doc.branding.color).toBe('blue');

    expect(doc.runs).toBeDefined();
    expect(doc.runs.using).toBe('node20');
    expect(doc.runs.main).toBe('dist/action.cjs');

    // Default provider must be live
    expect(doc.inputs.provider.default).toBe('live');
  });

  it('dist/action.cjs exists and is bundled', () => {
    expect(fs.existsSync(distActionPath)).toBe(true);
    const stats = fs.statSync(distActionPath);
    // Bundled action should be non-trivial in size (>100KB)
    expect(stats.size).toBeGreaterThan(100_000);
  });

  it('dist/action.cjs runs standalone under Node.js without missing dependencies', () => {
    const demoDir = path.join(rootDir, 'examples/demo-repository');
    const result = spawnSync(
      process.execPath,
      [distActionPath],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          INPUT_PROVIDER: 'mock',
          'INPUT_WORKING-DIRECTORY': demoDir,
          INPUT_COMMENT: 'false',
          INPUT_SUMMARY: 'false'
        },
        encoding: 'utf-8'
      }
    );

    // Should output action workflow commands and evaluate dependencies
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('Running DripGuard in directory:');
    expect(combined).toContain('::set-output name=status::');
    expect(combined).toContain('::set-output name=coverage-percent::');

    // Clean up report file if generated in rootDir
    const reportJson = path.join(rootDir, 'dripguard-report.json');
    if (fs.existsSync(reportJson)) fs.unlinkSync(reportJson);
  });
});
