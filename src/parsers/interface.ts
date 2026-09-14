import fs from 'node:fs';
import path from 'node:path';
import { Dependency, Ecosystem, RepositoryFileSet } from '../core/types.js';

export interface ParserOptions {
  includeDev?: boolean;
  includeTransitive?: boolean;
  includeOptional?: boolean;
  workspaces?: string[];
}

export interface ParserResult {
  ecosystem: Ecosystem;
  manifestFiles: string[];
  lockfiles: string[];
  dependencies: Dependency[];
}

export interface DependencyParser {
  readonly ecosystem: Ecosystem;
  readonly supportedFiles: string[];
  detect(files: RepositoryFileSet): boolean;
  parse(files: RepositoryFileSet, options?: ParserOptions): Promise<ParserResult>;
}

/**
 * In-memory implementation of RepositoryFileSet, useful for unit tests and fixtures.
 */
export class InMemoryRepositoryFileSet implements RepositoryFileSet {
  constructor(private readonly files: Map<string, string>, public readonly rootPath: string = '/') {}

  static fromRecord(record: Record<string, string>, rootPath: string = '/'): InMemoryRepositoryFileSet {
    return new InMemoryRepositoryFileSet(new Map(Object.entries(record)), rootPath);
  }

  hasFile(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    return this.files.has(normalized);
  }

  readFile(filePath: string): string | null {
    const normalized = normalizePath(filePath);
    return this.files.get(normalized) ?? null;
  }

  listFiles(pattern?: string | RegExp): string[] {
    const list = Array.from(this.files.keys());
    if (!pattern) return list;
    if (typeof pattern === 'string') {
      return list.filter(f => f.includes(pattern));
    }
    return list.filter(f => pattern.test(f));
  }
}

/**
 * Disk-based implementation of RepositoryFileSet.
 */
export class FileSystemRepositoryFileSet implements RepositoryFileSet {
  private fileListCache: string[] | null = null;

  constructor(public readonly rootPath: string) {}

  hasFile(filePath: string): boolean {
    const full = path.isAbsolute(filePath) ? filePath : path.join(this.rootPath, filePath);
    try {
      return fs.existsSync(full) && fs.statSync(full).isFile();
    } catch {
      return false;
    }
  }

  readFile(filePath: string): string | null {
    const full = path.isAbsolute(filePath) ? filePath : path.join(this.rootPath, filePath);
    try {
      if (!fs.existsSync(full)) return null;
      return fs.readFileSync(full, 'utf-8');
    } catch {
      return null;
    }
  }

  listFiles(pattern?: string | RegExp): string[] {
    if (!this.fileListCache) {
      this.fileListCache = this.walk(this.rootPath);
    }
    const list = this.fileListCache;
    if (!pattern) return list;
    if (typeof pattern === 'string') {
      return list.filter(f => f.includes(pattern));
    }
    return list.filter(f => pattern.test(f));
  }

  private walk(dir: string, baseDir: string = dir): string[] {
    const results: string[] = [];
    const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', 'target', 'vendor']);

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name)) {
            results.push(...this.walk(path.join(dir, entry.name), baseDir));
          }
        } else if (entry.isFile()) {
          const rel = path.relative(baseDir, path.join(dir, entry.name));
          results.push(normalizePath(rel));
        }
      }
    } catch {
      // Ignore unreadable dirs
    }

    return results;
  }
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
