import { Dependency, Ecosystem, RepositoryFileSet } from '../core/types.js';
import { DependencyParser, ParserOptions, ParserResult } from './interface.js';

export class PythonDependencyParser implements DependencyParser {
  readonly ecosystem: Ecosystem = 'pypi';
  readonly supportedFiles = [
    'requirements.txt',
    'requirements-dev.txt',
    'dev-requirements.txt',
    'pyproject.toml',
    'poetry.lock'
  ];

  detect(files: RepositoryFileSet): boolean {
    const list = files.listFiles(/(requirements.*\.txt|pyproject\.toml|poetry\.lock)$/);
    return list.length > 0;
  }

  async parse(files: RepositoryFileSet, options: ParserOptions = {}): Promise<ParserResult> {
    const manifestFiles = files.listFiles(/(requirements.*\.txt|pyproject\.toml)$/);
    const lockfiles = files.listFiles(/(^|\/)poetry\.lock$/);
    const depMap = new Map<string, Dependency>();

    for (const reqPath of manifestFiles) {
      const content = files.readFile(reqPath);
      if (!content) continue;

      if (reqPath.endsWith('.toml')) {
        this.parsePyProjectToml(content, reqPath, depMap, options);
      } else {
        this.parseRequirementsTxt(content, reqPath, depMap, options);
      }
    }

    for (const lockPath of lockfiles) {
      const content = files.readFile(lockPath);
      if (!content) continue;
      this.parsePoetryLock(content, lockPath, depMap, options);
    }

    return {
      ecosystem: 'pypi',
      manifestFiles,
      lockfiles,
      dependencies: Array.from(depMap.values())
    };
  }

  private parseRequirementsTxt(
    content: string,
    filePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const isDev = filePath.includes('dev') || filePath.includes('test');
    if (isDev && options.includeDev === false) return;

    const lines = content.split('\n');
    for (let line of lines) {
      line = line.split('#')[0].trim();
      if (!line || line.startsWith('-')) continue; // Skip flags like -r, -i, -e

      // Parse name and version specifier: package-name >= 1.0.0, package-name==2.0
      const match = line.match(/^([a-zA-Z0-9_.-]+)\s*([<>=!~].*)?$/);
      if (match) {
        const name = match[1].toLowerCase();
        const version = match[2]?.trim();

        const existing = depMap.get(name);
        if (!existing) {
          depMap.set(name, {
            name,
            ecosystem: 'pypi',
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

  private parsePyProjectToml(
    content: string,
    filePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const lines = content.split('\n');
    let currentSection: 'none' | 'dependencies' | 'dev_dependencies' | 'other' = 'none';

    for (let rawLine of lines) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;

      const sectionMatch = line.match(/^\[([a-zA-Z0-9_.-]+)\]$/);
      if (sectionMatch) {
        const sec = sectionMatch[1].toLowerCase();
        if (sec === 'project' || sec === 'tool.poetry.dependencies') {
          currentSection = 'dependencies';
        } else if (
          sec.includes('dev') ||
          sec.includes('test') ||
          sec === 'tool.poetry.group.dev.dependencies' ||
          sec === 'project.optional-dependencies.dev'
        ) {
          currentSection = 'dev_dependencies';
        } else {
          currentSection = 'other';
        }
        continue;
      }

      const isDev = currentSection === 'dev_dependencies';
      if (isDev && options.includeDev === false) continue;

      if (currentSection === 'dependencies' || currentSection === 'dev_dependencies') {
        // Line in poetry: requests = "^2.31.0" or package = { version = "...", ... }
        const kvMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/);
        if (kvMatch && kvMatch[1].toLowerCase() !== 'python' && kvMatch[1].toLowerCase() !== 'dependencies') {
          const name = kvMatch[1].toLowerCase();
          const val = kvMatch[2].trim();
          let version: string | undefined;

          if (val.startsWith('"')) {
            const vMatch = val.match(/^"([^"]+)"/);
            if (vMatch) version = vMatch[1];
          }

          const existing = depMap.get(name);
          if (!existing) {
            depMap.set(name, {
              name,
              ecosystem: 'pypi',
              version,
              direct: true,
              dev: isDev,
              optional: false,
              sourceFile: filePath
            });
          }
          continue;
        }

        // Line in PEP 621 dependencies array: "httpx>=0.24.0",
        const arrayItemMatch = line.match(/^["']([a-zA-Z0-9_.-]+)\s*([<>=!~].*)?["'],?$/);
        if (arrayItemMatch) {
          const name = arrayItemMatch[1].toLowerCase();
          const version = arrayItemMatch[2]?.trim();

          const existing = depMap.get(name);
          if (!existing) {
            depMap.set(name, {
              name,
              ecosystem: 'pypi',
              version,
              direct: true,
              dev: isDev,
              optional: false,
              sourceFile: filePath
            });
          }
        }
      }
    }
  }

  private parsePoetryLock(
    content: string,
    lockPath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const lines = content.split('\n');
    let inPackage = false;
    let currentName: string | undefined;
    let currentVersion: string | undefined;
    let isCategoryDev = false;

    const commitPackage = () => {
      if (currentName) {
        if (isCategoryDev && options.includeDev === false) {
          // skip
        } else {
          const existing = depMap.get(currentName);
          if (existing) {
            if (currentVersion && (!existing.version || existing.version.startsWith('^'))) {
              existing.version = currentVersion;
            }
          } else if (options.includeTransitive) {
            depMap.set(currentName, {
              name: currentName,
              ecosystem: 'pypi',
              version: currentVersion,
              direct: false,
              dev: isCategoryDev,
              optional: false,
              sourceFile: lockPath
            });
          }
        }
      }
      currentName = undefined;
      currentVersion = undefined;
      isCategoryDev = false;
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
        if (nameMatch) currentName = nameMatch[1].toLowerCase();

        const vMatch = line.match(/^version\s*=\s*"([^"]+)"/);
        if (vMatch) currentVersion = vMatch[1];

        const catMatch = line.match(/^category\s*=\s*"([^"]+)"/);
        if (catMatch && catMatch[1] === 'dev') isCategoryDev = true;
      }
    }

    if (inPackage) commitPackage();
  }
}
