import { describe, it, expect } from 'vitest';
import { calcAccountId, GITHUB_DRIVER_ID } from '../../src/drips/repodriver.js';

describe('RepoDriver calcAccountId', () => {
  it('calculates deterministic accountId for short repository names (<= 27 bytes)', () => {
    // colinhacks/zod is 14 bytes <= 27 bytes
    const accountId1 = calcAccountId('github', 'colinhacks', 'zod');
    const accountId2 = calcAccountId('github', 'colinhacks', 'zod');

    expect(accountId1).toBeDefined();
    expect(typeof accountId1).toBe('string');
    expect(accountId1).toBe(accountId2); // deterministic

    // Account ID should be a positive BigInt string
    const bi = BigInt(accountId1);
    expect(bi > 0n).toBe(true);

    // Forge ID for short GitHub names should be 0 (bits 216..223)
    const forgeId = Number((bi >> 216n) & 0xffn);
    expect(forgeId).toBe(0);

    // Driver ID should be GITHUB_DRIVER_ID (bits 224..255)
    const driverId = Number((bi >> 224n) & 0xffffffffn);
    expect(driverId).toBe(GITHUB_DRIVER_ID);
  });

  it('calculates deterministic accountId for long repository names (> 27 bytes)', () => {
    // open-telemetry/opentelemetry-js-contrib is 40 bytes > 27 bytes
    const accountId1 = calcAccountId('github', 'open-telemetry', 'opentelemetry-js-contrib');
    const accountId2 = calcAccountId('github', 'open-telemetry', 'opentelemetry-js-contrib');

    expect(accountId1).toBeDefined();
    expect(accountId1).toBe(accountId2);

    const bi = BigInt(accountId1);
    // Forge ID for long GitHub names should be 1 (bits 216..223)
    const forgeId = Number((bi >> 216n) & 0xffn);
    expect(forgeId).toBe(1);
  });

  it('supports GitLab repositories with distinct forgeId', () => {
    const ghId = calcAccountId('github', 'example', 'repo');
    const glId = calcAccountId('gitlab', 'example', 'repo');

    expect(ghId).not.toBe(glId);

    const glBi = BigInt(glId);
    const glForgeId = Number((glBi >> 216n) & 0xffn);
    expect(glForgeId).toBe(2); // short name on GitLab
  });
});
