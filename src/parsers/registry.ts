import { Dependency, Ecosystem, RepositoryFileSet } from '../core/types.js';
import { DependencyParser, ParserOptions, ParserResult } from './interface.js';
import { NpmDependencyParser } from './npm.js';
import { CargoDependencyParser } from './cargo.js';
import { GoDependencyParser } from './go.js';
import { PythonDependencyParser } from './python.js';

export class ParserRegistry {
  private readonly parsers: Map<Ecosystem, DependencyParser> = new Map();

  constructor() {
    this.register(new NpmDependencyParser());
    this.register(new CargoDependencyParser());
    this.register(new GoDependencyParser());
    this.register(new PythonDependencyParser());
  }

  register(parser: DependencyParser): void {
    this.parsers.set(parser.ecosystem, parser);
  }

  get(ecosystem: Ecosystem): DependencyParser | undefined {
    return this.parsers.get(ecosystem);
  }

  getAll(): DependencyParser[] {
    return Array.from(this.parsers.values());
  }

  detectEcosystems(files: RepositoryFileSet): Ecosystem[] {
    const detected: Ecosystem[] = [];
    for (const parser of this.parsers.values()) {
      if (parser.detect(files)) {
        detected.push(parser.ecosystem);
      }
    }
    return detected;
  }

  async parseAll(
    files: RepositoryFileSet,
    options: ParserOptions & { allowedEcosystems?: Ecosystem[] } = {}
  ): Promise<{
    dependencies: Dependency[];
    detectedEcosystems: Ecosystem[];
    manifestFiles: string[];
    lockfiles: string[];
  }> {
    const detected = this.detectEcosystems(files);
    const targetEcosystems = options.allowedEcosystems && options.allowedEcosystems.length > 0
      ? detected.filter(e => options.allowedEcosystems!.includes(e))
      : detected;

    const allDeps: Dependency[] = [];
    const allManifests: string[] = [];
    const allLocks: string[] = [];

    for (const eco of targetEcosystems) {
      const parser = this.parsers.get(eco);
      if (!parser) continue;

      const res = await parser.parse(files, options);
      allManifests.push(...res.manifestFiles);
      allLocks.push(...res.lockfiles);
      allDeps.push(...res.dependencies);
    }

    return {
      dependencies: allDeps,
      detectedEcosystems: targetEcosystems,
      manifestFiles: allManifests,
      lockfiles: allLocks
    };
  }
}

export const defaultParserRegistry = new ParserRegistry();
