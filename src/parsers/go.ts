import { Dependency, Ecosystem, RepositoryFileSet } from '../core/types.js';
import { DependencyParser, ParserOptions, ParserResult } from './interface.js';

export class GoDependencyParser implements DependencyParser {
  readonly ecosystem: Ecosystem = 'go';
  readonly supportedFiles = ['go.mod', 'go.sum'];

  detect(files: RepositoryFileSet): boolean {
    return files.listFiles(/go\.mod$/).length > 0;
  }

  async parse(files: RepositoryFileSet, options: ParserOptions = {}): Promise<ParserResult> {
    const manifestFiles = files.listFiles(/(^|\/)go\.mod$/);
    const lockfiles = files.listFiles(/(^|\/)go\.sum$/);
    const depMap = new Map<string, Dependency>();

    for (const modPath of manifestFiles) {
      const content = files.readFile(modPath);
      if (!content) continue;

      this.parseGoMod(content, modPath, depMap, options);
    }

    if (options.includeTransitive) {
      for (const sumPath of lockfiles) {
        const content = files.readFile(sumPath);
        if (!content) continue;

        this.parseGoSum(content, sumPath, depMap);
      }
    }

    return {
      ecosystem: 'go',
      manifestFiles,
      lockfiles,
      dependencies: Array.from(depMap.values())
    };
  }

  private parseGoMod(
    content: string,
    filePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const lines = content.split('\n');
    let inRequireBlock = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('require (')) {
        inRequireBlock = true;
        continue;
      }

      if (inRequireBlock && line === ')') {
        inRequireBlock = false;
        continue;
      }

      if (inRequireBlock) {
        this.parseRequireLine(line, filePath, depMap, options);
      } else if (line.startsWith('require ')) {
        const afterRequire = line.substring('require '.length).trim();
        this.parseRequireLine(afterRequire, filePath, depMap, options);
      }
    }
  }

  private parseRequireLine(
    line: string,
    filePath: string,
    depMap: Map<string, Dependency>,
    options: ParserOptions
  ): void {
    const isIndirect = line.includes('// indirect');
    const cleanLine = line.split('//')[0].trim();
    const parts = cleanLine.split(/\s+/);
    if (parts.length < 2) return;

    const modPath = parts[0];
    const version = parts[1];
    const isDirect = !isIndirect;

    if (!isDirect && !options.includeTransitive) {
      return;
    }

    const existing = depMap.get(modPath);
    if (!existing) {
      depMap.set(modPath, {
        name: modPath,
        ecosystem: 'go',
        version,
        direct: isDirect,
        dev: false,
        optional: false,
        sourceFile: filePath
      });
    } else {
      if (isDirect && !existing.direct) {
        existing.direct = true;
        existing.sourceFile = filePath;
      }
      if (!existing.version && version) {
        existing.version = version;
      }
    }
  }

  private parseGoSum(content: string, filePath: string, depMap: Map<string, Dependency>): void {
    const lines = content.split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;

      const modPath = parts[0];
      const version = parts[1].replace(/\/go\.mod$/, '');

      const existing = depMap.get(modPath);
      if (existing) {
        if (!existing.version) {
          existing.version = version;
        }
      } else {
        depMap.set(modPath, {
          name: modPath,
          ecosystem: 'go',
          version,
          direct: false,
          dev: false,
          optional: false,
          sourceFile: filePath
        });
      }
    }
  }
}
