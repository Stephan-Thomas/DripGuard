import YAML from 'yaml';
import { Dependency, Ecosystem, RepositoryFileSet } from '../core/types.js';
import { DependencyParser, normalizePath, ParserOptions, ParserResult } from './interface.js';

export class NpmDependencyParser implements DependencyParser {
  readonly ecosystem: Ecosystem = 'npm';
  readonly supportedFiles = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
  ];

  detect(files: RepositoryFileSet): boolean {
    const pkgFiles = files.listFiles(/package\.json$/);
    return pkgFiles.length > 0;
  }

  async parse(files: RepositoryFileSet, options: ParserOptions = {}): Promise<ParserResult> {
    const manifestFiles = files.listFiles(/(^|\/)package\.json$/);
    const lockfiles: string[] = [];
    const depMap = new Map<string, Dependency>();

    // Detect lockfiles
    for (const lock of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      const found = files.listFiles(new RegExp(`(^|/)${lock.replace('.', '\\.')}$`));
      lockfiles.push(...found);
    }

    // First, parse all package.json files (root and workspaces)
    for (const pkgPath of manifestFiles) {
      const content = files.readFile(pkgPath);
      if (!content) continue;

      try {
        const json = JSON.parse(content);
        const workspace = pkgPath === 'package.json' ? undefined : pkgPath.replace(/\/package\.json$/, '');

        // 1. Direct runtime dependencies
        if (json.dependencies && typeof json.dependencies === 'object') {
          for (const [name, version] of Object.entries(json.dependencies)) {
            this.addOrMerge(depMap, {
              name,
              ecosystem: 'npm',
              version: typeof version === 'string' ? version : undefined,
              direct: true,
              dev: false,
              optional: false,
              sourceFile: pkgPath,
              workspace
            });
          }
        }

        // 2. Dev dependencies
        if (options.includeDev !== false && json.devDependencies && typeof json.devDependencies === 'object') {
          for (const [name, version] of Object.entries(json.devDependencies)) {
            this.addOrMerge(depMap, {
              name,
              ecosystem: 'npm',
              version: typeof version === 'string' ? version : undefined,
              direct: true,
              dev: true,
              optional: false,
              sourceFile: pkgPath,
              workspace
            });
          }
        }

        // 3. Optional dependencies
        if (options.includeOptional && json.optionalDependencies && typeof json.optionalDependencies === 'object') {
          for (const [name, version] of Object.entries(json.optionalDependencies)) {
            this.addOrMerge(depMap, {
              name,
              ecosystem: 'npm',
              version: typeof version === 'string' ? version : undefined,
              direct: true,
              dev: false,
              optional: true,
              sourceFile: pkgPath,
              workspace
            });
          }
        }

        // 4. Peer dependencies (treated as runtime direct if not already dev)
        if (json.peerDependencies && typeof json.peerDependencies === 'object') {
          for (const [name, version] of Object.entries(json.peerDependencies)) {
            this.addOrMerge(depMap, {
              name,
              ecosystem: 'npm',
              version: typeof version === 'string' ? version : undefined,
              direct: true,
              dev: false,
              optional: false,
              sourceFile: pkgPath,
              workspace
            });
          }
        }
      } catch {
        // Continue if malformed manifest
      }
    }

    // Second, if transitive dependencies are requested or to refine locked versions:
    for (const lockfile of lockfiles) {
      const lockContent = files.readFile(lockfile);
      if (!lockContent) continue;

      if (lockfile.endsWith('package-lock.json')) {
        this.parsePackageLock(lockContent, lockfile, depMap, options);
      } else if (lockfile.endsWith('yarn.lock')) {
        this.parseYarnLock(lockContent, lockfile, depMap, options);
      } else if (lockfile.endsWith('pnpm-lock.yaml')) {
        this.parsePnpmLock(lockContent, lockfile, depMap, options);
      }
    }

    return {
      ecosystem: 'npm',
      manifestFiles,
      lockfiles,
      dependencies: Array.from(depMap.values())
    };
  }

  private addOrMerge(map: Map<string, Dependency>, dep: Dependency): void {
    const existing = map.get(dep.name);
    if (!existing) {
      map.set(dep.name, dep);
      return;
    }

    // Direct dependencies always take precedence over transitive
    if (!existing.direct && dep.direct) {
      existing.direct = true;
      existing.sourceFile = dep.sourceFile;
    }
    // Non-dev takes precedence over dev
    if (existing.dev && !dep.dev) {
      existing.dev = false;
    }
    // Update version if more specific
    if (!existing.version && dep.version) {
      existing.version = dep.version;
    }
  }

  private parsePackageLock(
    content: string,
    lockfilePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    try {
      const lock = JSON.parse(content);

      // Lockfile v2/v3 has `packages`
      if (lock.packages && typeof lock.packages === 'object') {
        for (const [pkgKey, pkgData] of Object.entries<any>(lock.packages)) {
          if (!pkgKey || pkgKey === '') continue; // root project
          const match = pkgKey.match(/node_modules\/(.+)$/);
          if (!match) continue;

          const name = match[1];
          const isDev = Boolean(pkgData.dev);
          const isOptional = Boolean(pkgData.optional);
          const version = pkgData.version;

          const existing = depMap.get(name);
          if (existing) {
            if (version && (!existing.version || existing.version.startsWith('^') || existing.version.startsWith('~'))) {
              existing.version = version;
            }
          } else if (options.includeTransitive) {
            if (isDev && options.includeDev === false) continue;
            if (isOptional && !options.includeOptional) continue;

            depMap.set(name, {
              name,
              ecosystem: 'npm',
              version,
              direct: false,
              dev: isDev,
              optional: isOptional,
              sourceFile: lockfilePath
            });
          }
        }
      } else if (lock.dependencies && typeof lock.dependencies === 'object') {
        // Lockfile v1
        for (const [name, pkgData] of Object.entries<any>(lock.dependencies)) {
          const isDev = Boolean(pkgData.dev);
          const isOptional = Boolean(pkgData.optional);
          const version = pkgData.version;

          const existing = depMap.get(name);
          if (existing) {
            if (version && (!existing.version || existing.version.startsWith('^') || existing.version.startsWith('~'))) {
              existing.version = version;
            }
          } else if (options.includeTransitive) {
            if (isDev && options.includeDev === false) continue;
            if (isOptional && !options.includeOptional) continue;

            depMap.set(name, {
              name,
              ecosystem: 'npm',
              version,
              direct: false,
              dev: isDev,
              optional: isOptional,
              sourceFile: lockfilePath
            });
          }
        }
      }
    } catch {
      // ignore lock parse errors
    }
  }

  private parseYarnLock(
    content: string,
    lockfilePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    try {
      // Match Yarn v1 blocks:
      // "package-name@^1.0.0", "package-name@~1.0.0":
      //   version "1.0.2"
      const lines = content.split('\n');
      let currentNames: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        if (rawLine.startsWith(' ') || rawLine.startsWith('\t')) {
          const vMatch = line.match(/^version:?\s+["']?([^"']+)["']?/);
          if (vMatch && currentNames.length > 0) {
            const version = vMatch[1];
            for (const name of currentNames) {
              const existing = depMap.get(name);
              if (existing) {
                if (version && (!existing.version || existing.version.startsWith('^') || existing.version.startsWith('~'))) {
                  existing.version = version;
                }
              } else if (options.includeTransitive) {
                depMap.set(name, {
                  name,
                  ecosystem: 'npm',
                  version,
                  direct: false,
                  dev: false,
                  optional: false,
                  sourceFile: lockfilePath
                });
              }
            }
            currentNames = [];
          }
        } else if (line.endsWith(':')) {
          // Header line
          const header = line.slice(0, -1);
          const parts = header.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
          currentNames = [];
          for (const part of parts) {
            // e.g. @scope/pkg@^1.0.0 or pkg@npm:1.0.0
            const lastAt = part.lastIndexOf('@');
            if (lastAt > 0) {
              const pkgName = part.substring(0, lastAt);
              if (!currentNames.includes(pkgName)) {
                currentNames.push(pkgName);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private parsePnpmLock(
    content: string,
    lockfilePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    try {
      const doc = YAML.parse(content);
      if (!doc) return;

      // In pnpm lockfile v5/v6/v9: packages map has entries like:
      // /@opentelemetry/api@1.4.0: or '@opentelemetry/api@1.4.0':
      const packages = doc.packages;
      if (packages && typeof packages === 'object') {
        for (const [key, val] of Object.entries<any>(packages)) {
          let cleanKey = key.replace(/^\//, '');
          const lastAt = cleanKey.lastIndexOf('@');
          if (lastAt <= 0) continue;
          const name = cleanKey.substring(0, lastAt);
          const version = cleanKey.substring(lastAt + 1).split('(')[0];

          const isDev = Boolean(val?.dev);
          const isOptional = Boolean(val?.optional);

          const existing = depMap.get(name);
          if (existing) {
            if (version && (!existing.version || existing.version.startsWith('^') || existing.version.startsWith('~'))) {
              existing.version = version;
            }
          } else if (options.includeTransitive) {
            if (isDev && options.includeDev === false) continue;
            if (isOptional && !options.includeOptional) continue;

            depMap.set(name, {
              name,
              ecosystem: 'npm',
              version,
              direct: false,
              dev: isDev,
              optional: isOptional,
              sourceFile: lockfilePath
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }
}
