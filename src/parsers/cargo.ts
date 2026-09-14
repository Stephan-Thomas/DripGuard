import { Dependency, Ecosystem, RepositoryFileSet } from '../core/types.js';
import { DependencyParser, ParserOptions, ParserResult } from './interface.js';

export class CargoDependencyParser implements DependencyParser {
  readonly ecosystem: Ecosystem = 'cargo';
  readonly supportedFiles = ['Cargo.toml', 'Cargo.lock'];

  detect(files: RepositoryFileSet): boolean {
    return files.listFiles(/Cargo\.toml$/).length > 0;
  }

  async parse(files: RepositoryFileSet, options: ParserOptions = {}): Promise<ParserResult> {
    const manifestFiles = files.listFiles(/(^|\/)Cargo\.toml$/);
    const lockfiles = files.listFiles(/(^|\/)Cargo\.lock$/);
    const depMap = new Map<string, Dependency>();

    // 1. Parse Cargo.toml files
    for (const tomlPath of manifestFiles) {
      const content = files.readFile(tomlPath);
      if (!content) continue;

      this.parseCargoToml(content, tomlPath, depMap, options);
    }

    // 2. Parse Cargo.lock files
    for (const lockPath of lockfiles) {
      const content = files.readFile(lockPath);
      if (!content) continue;

      this.parseCargoLock(content, lockPath, depMap, options);
    }

    return {
      ecosystem: 'cargo',
      manifestFiles,
      lockfiles,
      dependencies: Array.from(depMap.values())
    };
  }

  private parseCargoToml(
    content: string,
    filePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const lines = content.split('\n');
    let currentSection: 'none' | 'dependencies' | 'dev-dependencies' | 'build-dependencies' | 'other' = 'none';

    for (let rawLine of lines) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;

      const sectionMatch = line.match(/^\[([a-zA-Z0-9_.-]+)\]$/);
      if (sectionMatch) {
        const sec = sectionMatch[1].toLowerCase();
        if (sec === 'dependencies' || sec.endsWith('.dependencies')) {
          currentSection = 'dependencies';
        } else if (sec === 'dev-dependencies' || sec.endsWith('.dev-dependencies')) {
          currentSection = 'dev-dependencies';
        } else if (sec === 'build-dependencies' || sec.endsWith('.build-dependencies')) {
          currentSection = 'build-dependencies';
        } else {
          currentSection = 'other';
        }
        continue;
      }

      if (currentSection === 'dependencies' || currentSection === 'dev-dependencies' || currentSection === 'build-dependencies') {
        const isDev = currentSection === 'dev-dependencies';
        if (isDev && options.includeDev === false) continue;

        // Matches: name = "1.0" or name = { version = "1.0", ... }
        const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
        if (kvMatch) {
          const name = kvMatch[1];
          const val = kvMatch[2].trim();
          let version: string | undefined;

          if (val.startsWith('"')) {
            const vMatch = val.match(/^"([^"]+)"/);
            if (vMatch) version = vMatch[1];
          } else if (val.startsWith('{')) {
            const vMatch = val.match(/version\s*=\s*"([^"]+)"/);
            if (vMatch) version = vMatch[1];
          }

          const existing = depMap.get(name);
          if (!existing) {
            depMap.set(name, {
              name,
              ecosystem: 'cargo',
              version,
              direct: true,
              dev: isDev,
              optional: false,
              sourceFile: filePath
            });
          } else {
            if (!existing.direct) {
              existing.direct = true;
              existing.sourceFile = filePath;
            }
            if (existing.dev && !isDev) {
              existing.dev = false;
            }
          }
        }
      }
    }
  }

  private parseCargoLock(
    content: string,
    lockPath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const lines = content.split('\n');
    let inPackage = false;
    let currentName: string | undefined;
    let currentVersion: string | undefined;
    let currentSource: string | undefined;

    const commitPackage = () => {
      if (currentName) {
        // Skip packages with no source (typically the local workspace root crate)
        const isLocalRoot = !currentSource;
        if (!isLocalRoot) {
          const existing = depMap.get(currentName);
          if (existing) {
            if (currentVersion) {
              existing.version = currentVersion;
            }
          } else if (options.includeTransitive) {
            depMap.set(currentName, {
              name: currentName,
              ecosystem: 'cargo',
              version: currentVersion,
              direct: false,
              dev: false,
              optional: false,
              sourceFile: lockPath
            });
          }
        }
      }
      currentName = undefined;
      currentVersion = undefined;
      currentSource = undefined;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line === '[[package]]') {
        if (inPackage) commitPackage();
        inPackage = true;
        continue;
      }

      if (inPackage) {
        if (line.startsWith('[')) {
          commitPackage();
          inPackage = false;
          continue;
        }

        const nameMatch = line.match(/^name\s*=\s*"([^"]+)"/);
        if (nameMatch) currentName = nameMatch[1];

        const vMatch = line.match(/^version\s*=\s*"([^"]+)"/);
        if (vMatch) currentVersion = vMatch[1];

        const sMatch = line.match(/^source\s*=\s*"([^"]+)"/);
        if (sMatch) currentSource = sMatch[1];
      }
    }

    if (inPackage) commitPackage();
  }
}
