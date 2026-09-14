import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ZodError } from 'zod';
import { DripsConfig, DripsConfigSchema, RawDripsConfig } from './schema.js';
import { Ecosystem } from '../core/types.js';

export class ConfigurationError extends Error {
  constructor(message: string, public readonly details?: string[]) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const CONFIG_FILENAMES = ['.drips.yml', '.drips.yaml', 'drips.yml', 'drips.yaml'];

/**
 * Finds and loads the .drips.yml configuration file.
 */
export function findConfigFile(rootPath: string = process.cwd(), explicitPath?: string): string | null {
  if (explicitPath) {
    const resolved = path.isAbsolute(explicitPath) ? explicitPath : path.join(rootPath, explicitPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    throw new ConfigurationError(`Explicit config file not found: ${explicitPath}`);
  }

  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.join(rootPath, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Parses and validates raw YAML config content.
 */
export function parseConfig(yamlContent: string, sourcePath: string = '.drips.yml'): DripsConfig {
  let rawData: unknown;
  try {
    rawData = YAML.parse(yamlContent);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigurationError(`YAML parse error in ${sourcePath}: ${msg}`);
  }

  if (!rawData || typeof rawData !== 'object') {
    throw new ConfigurationError(`Invalid configuration in ${sourcePath}: Expected an object at top level.`);
  }

  try {
    return DripsConfigSchema.parse(rawData);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const details = err.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new ConfigurationError(
        `Configuration validation failed in ${sourcePath}:\n  - ${details.join('\n  - ')}`,
        details
      );
    }
    throw err;
  }
}

/**
 * Loads and validates the configuration from file or returns default configuration.
 */
export function loadConfig(rootPath: string = process.cwd(), explicitPath?: string): { config: DripsConfig; path: string | null } {
  const configFile = findConfigFile(rootPath, explicitPath);

  if (!configFile) {
    if (explicitPath) {
      throw new ConfigurationError(`Configuration file not found: ${explicitPath}`);
    }
    // Return sensible fallback config
    const defaultConfig = DripsConfigSchema.parse({
      project: {
        github: 'owner/repository'
      }
    });
    return { config: defaultConfig, path: null };
  }

  const content = fs.readFileSync(configFile, 'utf-8');
  const config = parseConfig(content, configFile);
  return { config, path: configFile };
}

/**
 * Generates an annotated starter .drips.yml content.
 */
export function generateDefaultConfig(options: {
  github?: string;
  ecosystems?: Ecosystem[];
  minimumCoverage?: number;
} = {}): string {
  const repo = options.github || 'owner/repository';
  const minCov = options.minimumCoverage ?? 90;

  return `# DripGuard Configuration (.drips.yml)
# Continuous CI verification between software dependencies and Drips funding graphs
version: 1

project:
  # The canonical GitHub owner/repository for this project
  github: ${repo}

dependencies:
  # Categories of dependencies to include in funding coverage evaluation
  include:
    - runtime
    - direct

  # Categories of dependencies excluded by default
  exclude:
    - dev
    - optional

funding:
  # Minimum percentage of dependencies with verified Drips funding
  minimum_dependency_coverage: ${minCov}

  # Strict 100% funding policy for direct runtime dependencies (optional)
  minimum_direct_dependency_coverage: 100

  # Maximum percentage of funding that can go to any single recipient project
  max_single_recipient_share: 70

  # Maximum Herfindahl-Hirschman Index (0-10000) to avoid excessive funding concentration
  max_concentration_hhi: 2500

policy:
  # Violations that trigger CLI exit code 1 / CI failure
  fail_on:
    - new_unfunded_dependency
    - insufficient_coverage
    - concentration

  # Warnings surfaced in PR comments and terminal output
  warn_on:
    - stale_funding
    - unresolved_dependency

exceptions:
  # Packages explicitly allowed to remain unfunded (with optional maintainer explanation)
  allowed_unfunded:
    # example-internal-pkg:
    #   reason: "In-house development helper not eligible for public Drips funding"

  # Projects excluded from drift and coverage checks
  ignored_projects: []

# Manual package-to-repository resolution mappings (override automatic resolution)
resolutions:
  # npm:
  #   "@opentelemetry/api":
  #     github: open-telemetry/opentelemetry-js

output:
  # Update a single persistent PR comment in CI
  comment_on_pull_request: true
  # Add rich Markdown summary to GitHub Actions Step Summary ($GITHUB_STEP_SUMMARY)
  create_summary: true
  # Default output format: text | json | sarif
  format: text
`;
}
