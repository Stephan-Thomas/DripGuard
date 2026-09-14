import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { runGitHubAction } from '../../src/github/action-runner.js';

vi.mock('@actions/core');
vi.mock('@actions/github', () => ({
  context: {
    eventName: 'pull_request',
    payload: {
      pull_request: { number: 42 }
    },
    repo: {
      owner: 'acme',
      repo: 'project'
    }
  },
  getOctokit: vi.fn()
}));

describe('GitHub Action Runner Integration', () => {
  const demoDir = path.resolve(__dirname, '../../examples/demo-repository');
  const outputs: Record<string, string> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  let failedMessage: string | null = null;
  const summaryChunks: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(outputs).forEach(k => delete outputs[k]);
    errors.length = 0;
    warnings.length = 0;
    failedMessage = null;
    summaryChunks.length = 0;

    vi.mocked(core.setOutput).mockImplementation((k, v) => {
      outputs[k] = String(v);
    });

    vi.mocked(core.setFailed).mockImplementation((msg) => {
      failedMessage = typeof msg === 'string' ? msg : msg.message;
    });

    vi.mocked(core.error).mockImplementation((msg) => {
      errors.push(typeof msg === 'string' ? msg : msg.message);
    });

    vi.mocked(core.warning).mockImplementation((msg) => {
      warnings.push(typeof msg === 'string' ? msg : msg.message);
    });

    // Mock core.summary
    (core as any).summary = {
      addRaw: vi.fn().mockImplementation((chunk: string) => {
        summaryChunks.push(chunk);
        return (core as any).summary;
      }),
      write: vi.fn().mockResolvedValue(undefined)
    };
    process.env.GITHUB_STEP_SUMMARY = 'step-summary.md';
  });

  afterEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
    // Cleanup generated report files if any in demoDir
    const reportJson = path.join(demoDir, 'dripguard-report.json');
    const reportSarif = path.join(demoDir, 'dripguard-report.sarif');
    if (fs.existsSync(reportJson)) fs.unlinkSync(reportJson);
    if (fs.existsSync(reportSarif)) fs.unlinkSync(reportSarif);
  });

  it('runs successfully with mock provider opt-in and sets all action outputs', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'working-directory') return demoDir;
      if (name === 'provider') return 'mock';
      if (name === 'comment') return 'false';
      if (name === 'summary') return 'true';
      if (name === 'format') return 'text';
      return '';
    });

    await runGitHubAction();

    expect(outputs['status']).toBeDefined();
    expect(outputs['coverage-percent']).toBeDefined();
    expect(outputs['violations-count']).toBeDefined();
    expect(outputs['unfunded-count']).toBeDefined();
    expect(outputs['report-path']).toBeDefined();
    expect(fs.existsSync(outputs['report-path'])).toBe(true);

    // Summary should have been written
    expect(summaryChunks.length).toBeGreaterThan(0);
    expect(summaryChunks[0]).toContain('DripGuard Funding Health Report');
  });

  it('defaults provider to live mode and fails cleanly if live API is unavailable', async () => {
    // Live mode by default (empty string or not provided)
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'working-directory') return demoDir;
      if (name === 'provider') return ''; // Empty defaults to live
      if (name === 'comment') return 'false';
      if (name === 'summary') return 'false';
      return '';
    });

    await runGitHubAction();

    // Since demo repo's drips project does not exist on live mainnet GraphQL without connection/mock,
    // it must set failed and NOT silently fallback to mock
    expect(failedMessage).not.toBeNull();
    expect(failedMessage).toMatch(/provider is unavailable|unexpected failure/i);
  });

  it('respects summary=false and does not write step summary', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'working-directory') return demoDir;
      if (name === 'provider') return 'mock';
      if (name === 'comment') return 'false';
      if (name === 'summary') return 'false';
      return '';
    });

    await runGitHubAction();

    expect(summaryChunks.length).toBe(0);
  });

  it('supports SARIF output format when requested', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'working-directory') return demoDir;
      if (name === 'provider') return 'mock';
      if (name === 'comment') return 'false';
      if (name === 'summary') return 'false';
      if (name === 'format') return 'sarif';
      return '';
    });

    await runGitHubAction();

    const sarifPath = path.join(demoDir, 'dripguard-report.sarif');
    expect(fs.existsSync(sarifPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(sarifPath, 'utf-8'));
    expect(content.version).toBe('2.1.0');
    expect(content.runs[0].tool.driver.name).toBe('DripGuard');
  });

  it('attempts to post/update PR comment when enabled and running in PR context', async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] });
    const createComment = vi.fn().mockResolvedValue({ data: { id: 101 } });
    const updateComment = vi.fn().mockResolvedValue({});

    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment
        }
      }
    } as any);

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'working-directory') return demoDir;
      if (name === 'provider') return 'mock';
      if (name === 'comment') return 'true';
      if (name === 'summary') return 'false';
      if (name === 'github-token') return 'mock-token-xyz';
      return '';
    });

    await runGitHubAction();

    expect(listComments).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'acme',
      repo: 'project',
      issue_number: 42
    }));
    expect(createComment).toHaveBeenCalled();
  });
});
