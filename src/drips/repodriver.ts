import { keccak_256 } from '@noble/hashes/sha3';
import { Forge } from '../core/types.js';

export const GITHUB_DRIVER_ID = 0; // Standard RepoDriver instance driverId

/**
 * Calculates deterministic Drips accountId for a forge repository according to RepoDriver.sol.
 *
 * Bitwise layout (256-bit uint256):
 * - driverId: 32 bits (bits 224..255)
 * - forgeId:   8 bits (bits 216..223)
 * - nameEncoded: 216 bits (27 bytes, bits 0..215)
 *
 * For GitHub:
 * - If UTF-8 bytes length <= 27:
 *     forgeId = 0
 *     nameEncoded = right-padded with zeroes to 27 bytes
 * - If UTF-8 bytes length > 27:
 *     forgeId = 1
 *     nameEncoded = lower 27 bytes of keccak256(name)
 */
export function calcAccountId(
  forge: Forge,
  owner: string,
  repo: string,
  driverId: number = GITHUB_DRIVER_ID
): string {
  const fullName = `${owner}/${repo}`.toLowerCase();
  const nameBytes = new TextEncoder().encode(fullName);

  let forgeId: number;
  let nameEncodedBytes: Uint8Array;

  if (forge === 'github') {
    if (nameBytes.length <= 27) {
      forgeId = 0;
      nameEncodedBytes = new Uint8Array(27);
      nameEncodedBytes.set(nameBytes);
    } else {
      forgeId = 1;
      const hash = keccak_256(nameBytes);
      // Take lower 27 bytes (hash is 32 bytes, lower 27 bytes are hash.subarray(5, 32))
      nameEncodedBytes = hash.subarray(5, 32);
    }
  } else {
    // GitLab: forgeId 2 (<=27) and 3 (>27)
    if (nameBytes.length <= 27) {
      forgeId = 2;
      nameEncodedBytes = new Uint8Array(27);
      nameEncodedBytes.set(nameBytes);
    } else {
      forgeId = 3;
      const hash = keccak_256(nameBytes);
      nameEncodedBytes = hash.subarray(5, 32);
    }
  }

  // Combine into a 256-bit BigInt
  let nameBigInt = 0n;
  for (let i = 0; i < 27; i++) {
    nameBigInt = (nameBigInt << 8n) | BigInt(nameEncodedBytes[i]);
  }

  const driverBigInt = BigInt(driverId) & 0xffffffffn;
  const forgeBigInt = BigInt(forgeId) & 0xffn;

  const accountId = (driverBigInt << 224n) | (forgeBigInt << 216n) | nameBigInt;
  return accountId.toString();
}
