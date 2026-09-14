import { CanonicalProject, Forge } from '../core/types.js';

/**
 * Normalizes an arbitrary Git or web URL into a canonical forge project.
 */
export function normalizeRepositoryUrl(rawUrl: string): CanonicalProject | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let url = rawUrl.trim();

  // Strip git+ or git:// or ssh:// or svn+
  url = url.replace(/^(git\+https?|git\+ssh|git|ssh|svn\+https?):\/\//i, 'https://');
  // Handle scp-like ssh syntax: git@github.com:owner/repo.git
  url = url.replace(/^git@github\.com:/i, 'https://github.com/');
  url = url.replace(/^git@gitlab\.com:/i, 'https://gitlab.com/');

  // Handle shorthand owner/repo (if exactly one slash and alphanumeric)
  const shorthandMatch = url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    const owner = shorthandMatch[1];
    const repository = shorthandMatch[2].replace(/\.git$/i, '');
    return {
      forge: 'github',
      owner,
      repository,
      url: `https://github.com/${owner}/${repository}`
    };
  }

  // Handle github:owner/repo or gitlab:owner/repo prefix
  const prefixMatch = url.match(/^(github|gitlab):([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/i);
  if (prefixMatch) {
    const forge = prefixMatch[1].toLowerCase() as Forge;
    const owner = prefixMatch[2];
    const repository = prefixMatch[3].replace(/\.git$/i, '');
    return {
      forge,
      owner,
      repository,
      url: `https://${forge}.com/${owner}/${repository}`
    };
  }

  // Parse GitHub / GitLab HTTP/HTTPS URLs
  const httpMatch = url.match(/https?:\/\/(www\.)?(github|gitlab)\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\/.*)?$/i);
  if (httpMatch) {
    const forge = httpMatch[2].toLowerCase() as Forge;
    const owner = httpMatch[3];
    let repository = httpMatch[4].replace(/\.git$/i, '');

    // Ignore tree/blob/issues suffixes if captured in repository
    if (repository.includes('/')) {
      repository = repository.split('/')[0];
    }

    if (!isValidIdentifier(owner) || !isValidIdentifier(repository)) {
      return null;
    }

    return {
      forge,
      owner,
      repository,
      url: `https://${forge}.com/${owner}/${repository}`
    };
  }

  return null;
}

function isValidIdentifier(id: string): boolean {
  if (!id || id.length === 0 || id.length > 100) return false;
  // Valid GitHub/GitLab usernames and repository names
  return /^[a-zA-Z0-9_.-]+$/.test(id) && id !== '.' && id !== '..';
}
