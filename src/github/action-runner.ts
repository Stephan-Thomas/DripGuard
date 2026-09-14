import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { runDripGuard } from '../index.js';
import { formatMarkdownReport, PR_COMMENT_ANCHOR } from '../reporting/markdown.js';
import { formatJsonReport } from '../reporting/json.js';
import { formatSarifReport } from '../reporting/sarif.js';
import { ExitCode } from '../core/types.js';

export async function runGitHubAction(): Promise<void> {
  try {
    const workingDir = core.getInput('working-directory') || process.cwd();
    const configPath = core.getInput('config') || undefined;
    const baselinePath = core.getInput('baseline') || undefined;
    const providerInput = (core.getInput('provider') || 'live').trim().toLowerCase();
    const providerMode = providerInput === 'mock' ? 'mock' : 'live';
    const commentInput = core.getInput('comment');
    const commentOnPr = commentInput !== '' ? commentInput.toLowerCase() !== 'false' : true;
    const summaryInput = core.getInput('summary');
    const createSummary = summaryInput !== '' ? summaryInput.toLowerCase() !== 'false' : true;
    const format = core.getInput('format') || 'text';
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN;

    core.info(`Running DripGuard in directory: ${workingDir}`);

    const result = await runDripGuard({
      repoRoot: workingDir,
      configPath,
      baselinePath,
      provider: providerMode === 'live' ? 'live' : 'mock'
    });

    // Set GitHub Action outputs
    core.setOutput('status', result.status);
    core.setOutput('coverage-percent', result.coverage.coveragePercent.toString());
    core.setOutput('violations-count', result.violations.length.toString());
    core.setOutput('unfunded-count', result.coverage.unfundedDependencies.toString());

    // Generate output report files if requested
    const reportPath = path.join(workingDir, 'dripguard-report.json');
    fs.writeFileSync(reportPath, formatJsonReport(result), 'utf-8');
    core.setOutput('report-path', reportPath);

    if (format === 'sarif') {
      const sarifPath = path.join(workingDir, 'dripguard-report.sarif');
      fs.writeFileSync(sarifPath, formatSarifReport(result), 'utf-8');
    }

    // Emit workflow annotations for violations and warnings
    for (const v of result.violations) {
      core.error(v.message, {
        title: `DripGuard Policy Violation: ${v.rule}`
      });
    }

    for (const w of result.warnings) {
      core.warning(w.message, {
        title: `DripGuard Policy Warning: ${w.rule}`
      });
    }

    // Write to GitHub Step Summary
    if (createSummary && process.env.GITHUB_STEP_SUMMARY) {
      const markdown = formatMarkdownReport(result);
      await core.summary.addRaw(markdown).write();
    }

    // Comment on Pull Request (Single stable updated comment)
    const context = github.context;
    const isPr = context.eventName === 'pull_request';
    const prNumber = context.payload.pull_request?.number;

    if (commentOnPr && isPr && prNumber && githubToken) {
      try {
        const octokit = github.getOctokit(githubToken);
        const { owner, repo } = context.repo;
        const markdown = formatMarkdownReport(result);

        // Find existing comment with the stable anchor
        const { data: comments } = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: prNumber
        });

        const existing = comments.find(c => c.body?.includes(PR_COMMENT_ANCHOR));

        if (existing) {
          core.info(`Updating existing DripGuard PR comment #${existing.id}`);
          await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existing.id,
            body: markdown
          });
        } else {
          core.info(`Posting new DripGuard PR comment`);
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: markdown
          });
        }
      } catch (commentErr: unknown) {
        core.warning(`Failed to post or update PR comment: ${commentErr instanceof Error ? commentErr.message : String(commentErr)}`);
      }
    }

    if (result.exitCode === ExitCode.POLICY_VIOLATION) {
      core.setFailed(`DripGuard detected ${result.violations.length} policy violations.`);
    } else if (result.exitCode === ExitCode.PROVIDER_UNAVAILABLE) {
      core.setFailed('DripGuard provider is unavailable.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    core.setFailed(`DripGuard unexpected failure: ${msg}`);
  }
}
