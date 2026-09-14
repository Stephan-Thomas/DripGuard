import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { runDripGuard } from '../index.js';
import { loadConfig, generateDefaultConfig, findConfigFile } from '../config/loader.js';
import { FileSystemRepositoryFileSet } from '../parsers/interface.js';
import { defaultParserRegistry } from '../parsers/registry.js';
import { DependencyResolver } from '../resolution/resolver.js';
import { LiveDripsFundingProvider } from '../drips/live-provider.js';
import { MockDripsFundingProvider } from '../drips/mock-provider.js';
import { BaselineManager, DEFAULT_BASELINE_FILE } from '../baseline/manager.js';
import { formatTerminalReport } from '../reporting/terminal.js';
import { formatJsonReport } from '../reporting/json.js';
import { formatSarifReport } from '../reporting/sarif.js';
import { ExitCode } from '../core/types.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('dripguard')
    .description('Detect drift between open-source software dependencies and Drips funding graphs')
    .version('1.0.0');

  // Command 1: check
  program
    .command('check')
    .description('Check current repository dependency graph against Drips funding policy')
    .option('-c, --config <path>', 'Path to .drips.yml configuration file')
    .option('-f, --format <type>', 'Output format: text, json, sarif', 'text')
    .option('-m, --mock', 'Run with deterministic offline mock Drips provider', false)
    .option('-p, --provider <mode>', 'Provider mode: live or mock', 'live')
    .option('-v, --verbose', 'Print detailed dependency classification breakdown', false)
    .option('-o, --output <file>', 'Save output report to file')
    .option('--save-baseline', 'Save current resolved dependencies as baseline file')
    .action(async (opts) => {
      try {
        const repoRoot = process.cwd();
        const providerMode = opts.mock ? 'mock' : (opts.provider === 'mock' ? 'mock' : 'live');

        const result = await runDripGuard({
          repoRoot,
          configPath: opts.config,
          provider: providerMode,
          verbose: opts.verbose
        });

        if (opts.saveBaseline) {
          const baselineFile = path.join(repoRoot, DEFAULT_BASELINE_FILE);
          BaselineManager.saveBaseline(
            baselineFile,
            result.repository,
            result.dependencies.map(d => d.resolvedDependency),
            result.coverage.coveragePercent,
            result.commitSha
          );
          console.log(pc.green(`✓ Baseline saved to ${DEFAULT_BASELINE_FILE}`));
        }

        renderOutput(result, opts.format, opts.output, opts.verbose);
        process.exit(result.exitCode);
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  // Command 2: diff
  program
    .command('diff')
    .description('Compare baseline dependency graph against current graph to detect funding drift')
    .option('-b, --baseline <path>', 'Path to baseline file', DEFAULT_BASELINE_FILE)
    .option('-c, --config <path>', 'Path to .drips.yml configuration file')
    .option('-f, --format <type>', 'Output format: text, json, sarif', 'text')
    .option('-m, --mock', 'Run with deterministic mock provider', false)
    .option('-v, --verbose', 'Print verbose output', false)
    .action(async (opts) => {
      try {
        const repoRoot = process.cwd();
        const baselinePath = path.resolve(repoRoot, opts.baseline);

        if (!fs.existsSync(baselinePath)) {
          console.error(pc.red(`Error: Baseline file not found at ${opts.baseline}. Run "dripguard check --save-baseline" first.`));
          process.exit(ExitCode.CONFIGURATION_ERROR);
        }

        const result = await runDripGuard({
          repoRoot,
          configPath: opts.config,
          baselinePath,
          provider: opts.mock ? 'mock' : 'live',
          verbose: opts.verbose
        });

        renderOutput(result, opts.format, undefined, opts.verbose);
        process.exit(result.exitCode);
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  // Command 3: dependencies
  program
    .command('dependencies')
    .description('List all discovered dependencies and their canonical forge mappings')
    .option('-c, --config <path>', 'Path to .drips.yml configuration file')
    .option('-a, --all', 'Include transitive dependencies from lockfiles', false)
    .option('--json', 'Output as JSON array', false)
    .action(async (opts) => {
      try {
        const repoRoot = process.cwd();
        const fileSet = new FileSystemRepositoryFileSet(repoRoot);
        const parsed = await defaultParserRegistry.parseAll(fileSet, {
          includeDev: true,
          includeTransitive: Boolean(opts.all)
        });
        const resolver = new DependencyResolver({ allowNetwork: true, timeoutMs: 2000 });
        const resolved = await resolver.resolveAll(parsed.dependencies);

        if (opts.json) {
          console.log(JSON.stringify(resolved, null, 2));
          return;
        }

        console.log('');
        console.log(pc.bold(pc.cyan(`Discovered Dependencies (${resolved.length}):`)));
        console.log('');
        for (const r of resolved) {
          const statusColor = r.resolutionStatus === 'resolved' ? pc.green : pc.yellow;
          const proj = r.project ? `${r.project.owner}/${r.project.repository}` : '(unresolved)';
          const meta = pc.dim(`[${r.dependency.ecosystem}] ${r.dependency.direct ? 'direct' : 'transitive'}${r.dependency.dev ? ' dev' : ''}`);
          console.log(`  ${statusColor(r.dependency.name)} -> ${proj} ${meta}`);
        }
        console.log('');
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  // Command 4: funding
  program
    .command('funding')
    .description('Inspect current Drips funding splits and streams for this project')
    .option('-c, --config <path>', 'Path to .drips.yml configuration file')
    .option('-m, --mock', 'Use mock provider', false)
    .action(async (opts) => {
      try {
        const repoRoot = process.cwd();
        const { config } = loadConfig(repoRoot, opts.config);
        const provider = opts.mock ? new MockDripsFundingProvider() : new LiveDripsFundingProvider();

        const [owner, repo] = config.project.github.split('/');
        const project = await provider.resolveProject({ forge: 'github', owner, repository: repo });
        if (!project) {
          console.log(pc.yellow(`No Drips project registered yet for ${config.project.github}`));
          return;
        }

        const funding = await provider.getProjectFunding(project);
        console.log('');
        console.log(pc.bold(pc.cyan(`Drips Funding Graph for ${config.project.github}`)));
        console.log(pc.dim(`Account ID: ${project.accountId} | Mode: ${funding.providerMode}`));
        console.log('');
        console.log(pc.bold(`Configured Outgoing Splits (${funding.splits.length}):`));
        for (const s of funding.splits) {
          const name = s.receiverProject ? `${s.receiverProject.owner}/${s.receiverProject.repository}` : s.receiver;
          console.log(`  - ${pc.cyan(name)}: ${pc.bold(`${s.sharePercent.toFixed(1)}%`)} (weight: ${s.weight})`);
        }
        console.log('');
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  // Command 5: explain
  program
    .command('explain [dependency]')
    .description('Explain why DripGuard failed or why a dependency is unfunded/unresolved')
    .option('-c, --config <path>', 'Path to .drips.yml configuration file')
    .option('-m, --mock', 'Use mock provider', false)
    .action(async (targetDep, opts) => {
      try {
        const repoRoot = process.cwd();
        const result = await runDripGuard({
          repoRoot,
          configPath: opts.config,
          provider: opts.mock ? 'mock' : 'live'
        });

        console.log('');
        console.log(pc.bold(pc.cyan('💧 DripGuard Diagnostic Explanation')));
        console.log('');

        if (targetDep) {
          const match = result.dependencies.find(d =>
            d.resolvedDependency.dependency.name.toLowerCase() === targetDep.toLowerCase()
          );

          if (!match) {
            console.log(pc.yellow(`Dependency "${targetDep}" not found in current software manifest.`));
            return;
          }

          console.log(pc.bold('Dependency: ') + match.resolvedDependency.dependency.name);
          console.log(pc.bold('Ecosystem: ') + match.resolvedDependency.dependency.ecosystem);
          console.log(pc.bold('Classification: ') + match.classification);
          console.log(pc.bold('Canonical Project: ') + (match.resolvedDependency.project ? match.resolvedDependency.project.url : 'Not resolved'));
          console.log(pc.bold('Evidence / Reason: ') + (match.evidence || match.exemptionReason || 'None'));
          console.log('');
          if (match.classification === 'UNFUNDED') {
            console.log(pc.cyan('Suggested action:'));
            console.log(`  Add this project (${match.resolvedDependency.project?.owner}/${match.resolvedDependency.project?.repository}) to your Drips splits configuration, or add an exemption in .drips.yml under exceptions.allowed_unfunded.`);
          } else if (match.classification === 'UNRESOLVED') {
            console.log(pc.cyan('Suggested action:'));
            console.log(`  Add a manual resolution mapping in .drips.yml under resolutions.${match.resolvedDependency.dependency.ecosystem}.${match.resolvedDependency.dependency.name}.`);
          }
          console.log('');
          return;
        }

        // Explain overall run violations
        if (result.violations.length === 0) {
          console.log(pc.green('✓ All DripGuard policies passed! No violations to explain.'));
          console.log('');
          return;
        }

        console.log(pc.bold(`Found ${result.violations.length} policy violations:`));
        console.log('');
        for (const v of result.violations) {
          console.log(pc.bold(pc.red(`✗ Rule: ${v.rule}`)));
          console.log(`  ${v.message}`);
          if (v.details) {
            console.log(pc.dim(`  Details: ${JSON.stringify(v.details)}`));
          }
          console.log('');
        }
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  // Command 6: init
  program
    .command('init')
    .description('Initialize .drips.yml configuration for this repository with sensible defaults')
    .option('--force', 'Overwrite existing .drips.yml file without asking', false)
    .action(async (opts) => {
      try {
        const repoRoot = process.cwd();
        const existing = findConfigFile(repoRoot);

        if (existing && !opts.force) {
          console.log(pc.yellow(`Configuration file already exists at ${path.basename(existing)}.`));
          console.log('Use --force to overwrite.');
          return;
        }

        // Auto-detect git remote
        let githubRepo = 'owner/repository';
        try {
          const gitConfigPath = path.join(repoRoot, '.git', 'config');
          if (fs.existsSync(gitConfigPath)) {
            const gitConfig = fs.readFileSync(gitConfigPath, 'utf-8');
            const match = gitConfig.match(/github\.com[:/]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\.git)?/);
            if (match) {
              githubRepo = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
            }
          }
        } catch {
          // ignore
        }

        const fileSet = new FileSystemRepositoryFileSet(repoRoot);
        const ecosystems = defaultParserRegistry.detectEcosystems(fileSet);

        console.log('');
        console.log(pc.bold(pc.cyan('💧 Initializing DripGuard')));
        console.log('');
        console.log(pc.green('Detected ecosystems:'));
        for (const eco of ecosystems) {
          console.log(`  ${pc.green('✓')} ${eco}`);
        }
        if (ecosystems.length === 0) {
          console.log(pc.dim('  (none detected; default templates created)'));
        }

        console.log(pc.green(`Detected repository: ${githubRepo}`));

        const configContent = generateDefaultConfig({
          github: githubRepo,
          ecosystems,
          minimumCoverage: 90
        });

        const targetFile = path.join(repoRoot, '.drips.yml');
        fs.writeFileSync(targetFile, configContent, 'utf-8');

        console.log('');
        console.log(pc.green(`✓ Created ${targetFile}`));
        console.log('');
        console.log('Run the following to verify funding alignment:');
        console.log(pc.cyan('  npx dripguard check'));
        console.log('');
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  // Command 7: validate
  program
    .command('validate')
    .description('Validate syntax and rules of .drips.yml configuration')
    .option('-c, --config <path>', 'Path to .drips.yml configuration file')
    .action(async (opts) => {
      try {
        const repoRoot = process.cwd();
        const { config, path: loadedPath } = loadConfig(repoRoot, opts.config);

        console.log('');
        console.log(pc.green(`✓ Configuration is valid: ${loadedPath || 'default config'}`));
        console.log(`  Project: ${pc.cyan(config.project.github)}`);
        console.log(`  Minimum Coverage: ${config.funding.minimum_dependency_coverage}%`);
        console.log(`  Max Single Share: ${config.funding.max_single_recipient_share}%`);
        console.log(`  Max Concentration HHI: ${config.funding.max_concentration_hhi}`);
        console.log('');
      } catch (err: unknown) {
        handleCliError(err);
      }
    });

  return program;
}

function renderOutput(result: any, format: string, outputFile?: string, verbose: boolean = false): void {
  let content = '';

  if (format === 'json') {
    content = formatJsonReport(result);
  } else if (format === 'sarif') {
    content = formatSarifReport(result);
  } else {
    content = formatTerminalReport(result, verbose);
  }

  if (outputFile) {
    fs.writeFileSync(path.resolve(outputFile), content, 'utf-8');
    console.log(pc.green(`✓ Report written to ${outputFile}`));
  } else {
    console.log(content);
  }
}

function handleCliError(err: unknown): void {
  if (err && typeof err === 'object' && 'name' in err && err.name === 'ConfigurationError') {
    console.error(pc.red(`\n${(err as Error).message}\n`));
    process.exit(ExitCode.CONFIGURATION_ERROR);
  } else if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'PROVIDER_UNAVAILABLE') {
    const msg = err instanceof Error ? err.message : String((err as any).message || err);
    console.error(pc.red(`\nDrips Provider Unavailable: ${msg}\n`));
    process.exit(ExitCode.PROVIDER_UNAVAILABLE);
  } else {
    console.error(pc.red(`\nUnexpected error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`));
    process.exit(ExitCode.INTERNAL_ERROR);
  }
}
