import fs from 'node:fs';
import path from 'node:path';
import { CanonicalProject, Dependency, DriftAnalysis, Ecosystem, ResolvedDependency } from '../core/types.js';

export interface BaselineDependencyItem {
  name: string;
  ecosystem: Ecosystem;
  version?: string;
  direct: boolean;
  dev: boolean;
  optional?: boolean;
  project?: CanonicalProject;
}

export interface BaselineData {
  version: 1;
  timestamp: string;
  repository: string;
  commitSha?: string;
  coveragePercent?: number;
  dependencies: BaselineDependencyItem[];
}

export const DEFAULT_BASELINE_FILE = '.dripguard-baseline.json';

export class BaselineManager {
  static loadBaseline(filePath: string): BaselineData | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as BaselineData;
      if (data && data.version === 1 && Array.isArray(data.dependencies)) {
        return data;
      }
    } catch {
      // Return null on malformed baseline file
    }
    return null;
  }

  static saveBaseline(
    filePath: string,
    repository: string,
    resolvedDependencies: ResolvedDependency[],
    coveragePercent?: number,
    commitSha?: string
  ): void {
    const data: BaselineData = {
      version: 1,
      timestamp: new Date().toISOString(),
      repository,
      commitSha,
      coveragePercent,
      dependencies: resolvedDependencies.map(d => ({
        name: d.dependency.name,
        ecosystem: d.dependency.ecosystem,
        version: d.dependency.version,
        direct: d.dependency.direct,
        dev: d.dependency.dev,
        optional: d.dependency.optional,
        project: d.project
      }))
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  static toResolvedDependencies(baseline: BaselineData): ResolvedDependency[] {
    return baseline.dependencies.map(item => ({
      dependency: {
        name: item.name,
        ecosystem: item.ecosystem,
        version: item.version,
        direct: item.direct,
        dev: item.dev,
        optional: Boolean(item.optional),
        sourceFile: 'baseline'
      },
      project: item.project,
      resolutionStatus: item.project ? 'resolved' : 'unknown',
      resolutionSource: 'lockfile'
    }));
  }
}
