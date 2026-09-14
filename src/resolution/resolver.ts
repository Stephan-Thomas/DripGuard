import { CanonicalProject, Dependency, ResolvedDependency, ResolutionSource, ResolutionStatus } from '../core/types.js';
import { normalizeRepositoryUrl } from './normalizer.js';
import { DripsConfig } from '../config/schema.js';

export interface ResolutionOptions {
  allowNetwork?: boolean;
  timeoutMs?: number;
  config?: DripsConfig;
}

// Well-known open source projects mapping for fast, deterministic, offline resolution
const WELL_KNOWN_PROJECTS: Record<string, Record<string, { forge: 'github' | 'gitlab'; owner: string; repo: string }>> = {
  npm: {
    'react': { forge: 'github', owner: 'facebook', repo: 'react' },
    'react-dom': { forge: 'github', owner: 'facebook', repo: 'react' },
    'express': { forge: 'github', owner: 'expressjs', repo: 'express' },
    'zod': { forge: 'github', owner: 'colinhacks', repo: 'zod' },
    'vitest': { forge: 'github', owner: 'vitest-dev', repo: 'vitest' },
    '@opentelemetry/api': { forge: 'github', owner: 'open-telemetry', repo: 'opentelemetry-js' },
    '@opentelemetry/sdk-node': { forge: 'github', owner: 'open-telemetry', repo: 'opentelemetry-js' },
    'opentelemetry': { forge: 'github', owner: 'open-telemetry', repo: 'opentelemetry-js' },
    'typescript': { forge: 'github', owner: 'microsoft', repo: 'TypeScript' },
    'commander': { forge: 'github', owner: 'tj', repo: 'commander.js' },
    'yaml': { forge: 'github', owner: 'eemeli', repo: 'yaml' },
    'picocolors': { forge: 'github', owner: 'alexeyraspopov', repo: 'picocolors' },
    'lodash': { forge: 'github', owner: 'lodash', repo: 'lodash' },
    'axios': { forge: 'github', owner: 'axios', repo: 'axios' },
    'ethers': { forge: 'github', owner: 'ethers-io', repo: 'ethers.js' },
    'viem': { forge: 'github', owner: 'wevm', repo: 'viem' },
    '@actions/core': { forge: 'github', owner: 'actions', repo: 'toolkit' },
    '@actions/github': { forge: 'github', owner: 'actions', repo: 'toolkit' },
    '@noble/hashes': { forge: 'github', owner: 'paulmillr', repo: 'noble-hashes' },
    'rimraf': { forge: 'github', owner: 'isaacs', repo: 'rimraf' }
  },
  cargo: {
    'serde': { forge: 'github', owner: 'serde-rs', repo: 'serde' },
    'serde_json': { forge: 'github', owner: 'serde-rs', repo: 'json' },
    'tokio': { forge: 'github', owner: 'tokio-rs', repo: 'tokio' },
    'syn': { forge: 'github', owner: 'dtolnay', repo: 'syn' },
    'quote': { forge: 'github', owner: 'dtolnay', repo: 'quote' },
    'anyhow': { forge: 'github', owner: 'dtolnay', repo: 'anyhow' },
    'thiserror': { forge: 'github', owner: 'dtolnay', repo: 'thiserror' },
    'reqwest': { forge: 'github', owner: 'seanmonstar', repo: 'reqwest' },
    'clap': { forge: 'github', owner: 'clap-rs', repo: 'clap' },
    'criterion': { forge: 'github', owner: 'bheisler', repo: 'criterion.rs' }
  },
  go: {
    'go.uber.org/zap': { forge: 'github', owner: 'uber-go', repo: 'zap' },
    'golang.org/x/sync': { forge: 'github', owner: 'golang', repo: 'sync' },
    'golang.org/x/net': { forge: 'github', owner: 'golang', repo: 'net' },
    'golang.org/x/sys': { forge: 'github', owner: 'golang', repo: 'sys' },
    'golang.org/x/text': { forge: 'github', owner: 'golang', repo: 'text' },
    'google.golang.org/grpc': { forge: 'github', owner: 'grpc', repo: 'grpc-go' }
  },
  pypi: {
    'requests': { forge: 'github', owner: 'psf', repo: 'requests' },
    'urllib3': { forge: 'github', owner: 'urllib3', repo: 'urllib3' },
    'flask': { forge: 'github', owner: 'pallets', repo: 'flask' },
    'django': { forge: 'github', owner: 'django', repo: 'django' },
    'pytest': { forge: 'github', owner: 'pytest-dev', repo: 'pytest' },
    'pydantic': { forge: 'github', owner: 'pydantic', repo: 'pydantic' },
    'httpx': { forge: 'github', owner: 'encode', repo: 'httpx' },
    'fastapi': { forge: 'github', owner: 'tiangolo', repo: 'fastapi' },
    'torch': { forge: 'github', owner: 'pytorch', repo: 'pytorch' }
  }
};

export class DependencyResolver {
  private readonly cache = new Map<string, CanonicalProject | null>();

  constructor(private readonly options: ResolutionOptions = {}) {}

  /**
   * Resolves a dependency to its canonical forge project.
   */
  async resolve(dependency: Dependency): Promise<ResolvedDependency> {
    const cacheKey = `${dependency.ecosystem}:${dependency.name}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          dependency,
          project: cached,
          resolutionStatus: 'resolved',
          resolutionSource: 'manifest',
          resolutionDetails: 'Resolved from cache'
        };
      }
    }

    // 1. Check manual resolution overrides from config
    const override = this.checkManualOverride(dependency);
    if (override) {
      this.cache.set(cacheKey, override);
      return {
        dependency,
        project: override,
        resolutionStatus: 'resolved',
        resolutionSource: 'manual_override',
        resolutionDetails: `Resolved via .drips.yml override for ${dependency.name}`
      };
    }

    // 2. For Go, check if import path is directly github.com/owner/repo
    if (dependency.ecosystem === 'go') {
      const goProj = this.resolveGoImport(dependency.name);
      if (goProj) {
        this.cache.set(cacheKey, goProj);
        return {
          dependency,
          project: goProj,
          resolutionStatus: 'resolved',
          resolutionSource: 'manifest',
          resolutionDetails: `Parsed directly from Go module import path: ${dependency.name}`
        };
      }
    }

    // 3. Check well-known canonical projects dictionary
    const wellKnown = WELL_KNOWN_PROJECTS[dependency.ecosystem]?.[dependency.name];
    if (wellKnown) {
      const project: CanonicalProject = {
        forge: wellKnown.forge,
        owner: wellKnown.owner,
        repository: wellKnown.repo,
        url: `https://${wellKnown.forge}.com/${wellKnown.owner}/${wellKnown.repo}`
      };
      this.cache.set(cacheKey, project);
      return {
        dependency,
        project,
        resolutionStatus: 'resolved',
        resolutionSource: 'heuristic',
        resolutionDetails: `Resolved from canonical open-source registry dictionary`
      };
    }

    // 4. Query ecosystem registry if network is permitted
    if (this.options.allowNetwork) {
      const registryProj = await this.queryRegistry(dependency);
      if (registryProj) {
        this.cache.set(cacheKey, registryProj);
        return {
          dependency,
          project: registryProj,
          resolutionStatus: 'resolved',
          resolutionSource: 'registry',
          resolutionDetails: `Resolved from official ${dependency.ecosystem} package registry metadata`
        };
      }
    }

    // 5. Unresolved
    this.cache.set(cacheKey, null);
    return {
      dependency,
      resolutionStatus: 'unknown',
      resolutionSource: 'unresolved',
      resolutionDetails: `No verified canonical repository mapping found for ${dependency.name}. Add a manual resolution in .drips.yml under resolutions.${dependency.ecosystem}.${dependency.name}`
    };
  }

  /**
   * Resolves an entire array of dependencies with bounded concurrency and deduplication.
   */
  async resolveAll(dependencies: Dependency[], concurrency: number = 8): Promise<ResolvedDependency[]> {
    if (dependencies.length === 0) return [];

    const results: ResolvedDependency[] = new Array(dependencies.length);
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < dependencies.length) {
        const idx = currentIndex++;
        results[idx] = await this.resolve(dependencies[idx]);
      }
    };

    const workerCount = Math.min(concurrency, dependencies.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }

  private checkManualOverride(dep: Dependency): CanonicalProject | null {
    const config = this.options.config;
    if (!config?.resolutions) return null;

    const ecoOverrides = config.resolutions[dep.ecosystem];
    if (!ecoOverrides) return null;

    const mapping = ecoOverrides[dep.name];
    if (!mapping) return null;

    const forge = mapping.forge;
    const parts = mapping.repo.split('/');
    if (parts.length === 2) {
      return {
        forge,
        owner: parts[0],
        repository: parts[1],
        url: `https://${forge}.com/${parts[0]}/${parts[1]}`
      };
    }

    return null;
  }

  private resolveGoImport(modPath: string): CanonicalProject | null {
    const match = modPath.match(/^github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\/.*)?$/);
    if (match) {
      const owner = match[1];
      const repository = match[2];
      return {
        forge: 'github',
        owner,
        repository,
        url: `https://github.com/${owner}/${repository}`
      };
    }
    return null;
  }

  private async queryRegistry(dep: Dependency): Promise<CanonicalProject | null> {
    const timeout = this.options.timeoutMs || 3000;
    try {
      if (dep.ecosystem === 'npm') {
        const url = `https://registry.npmjs.org/${encodeURIComponent(dep.name)}`;
        const res = await fetchWithTimeout(url, timeout);
        if (!res.ok) return null;
        const data = await res.json() as any;
        const repoUrl = data.repository?.url || (typeof data.repository === 'string' ? data.repository : undefined);
        if (repoUrl) return normalizeRepositoryUrl(repoUrl);
      } else if (dep.ecosystem === 'cargo') {
        const url = `https://crates.io/api/v1/crates/${encodeURIComponent(dep.name)}`;
        const res = await fetchWithTimeout(url, timeout, { 'User-Agent': 'DripGuard/0.1.0' });
        if (!res.ok) return null;
        const data = await res.json() as any;
        const repoUrl = data.crate?.repository;
        if (repoUrl) return normalizeRepositoryUrl(repoUrl);
      } else if (dep.ecosystem === 'pypi') {
        const url = `https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`;
        const res = await fetchWithTimeout(url, timeout);
        if (!res.ok) return null;
        const data = await res.json() as any;
        const urls = data.info?.project_urls;
        const repoUrl = urls?.Source || urls?.Repository || urls?.['Source Code'] || data.info?.home_page;
        if (repoUrl) return normalizeRepositoryUrl(repoUrl);
      }
    } catch {
      // Offline or network failure gracefully returns null without crashing
    }
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(id);
  }
}
