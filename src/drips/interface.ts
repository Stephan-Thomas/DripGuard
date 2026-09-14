import {
  CanonicalProject,
  DripsDependency,
  DripsProject,
  FundingRoute,
  FundingSplit,
  ProjectFunding,
  ProviderMode
} from '../core/types.js';

export interface ProjectLookup {
  forge: 'github' | 'gitlab';
  owner: string;
  repository: string;
}

export class DripsProviderError extends Error {
  constructor(message: string, public readonly code: string = 'DRIPS_ERROR', public readonly cause?: unknown) {
    super(message);
    this.name = 'DripsProviderError';
  }
}

export interface DripsFundingProvider {
  readonly name: string;
  readonly mode: ProviderMode;

  /**
   * Resolves a canonical repository to a Drips Project entity (with accountId and identity).
   */
  resolveProject(input: ProjectLookup): Promise<DripsProject | null>;

  /**
   * Retrieves full funding information (incoming streams, splits, total funds).
   */
  getProjectFunding(project: DripsProject): Promise<ProjectFunding>;

  /**
   * Retrieves outgoing funding splits configured for this project.
   */
  getProjectSplits(project: DripsProject): Promise<FundingSplit[]>;

  /**
   * Retrieves funded dependency relationships according to Drips.
   */
  getProjectDependencies(project: DripsProject): Promise<DripsDependency[]>;

  /**
   * Retrieves complete funding routes (splits, streams, drip lists) connecting to target projects.
   */
  getFundingRoutes(project: DripsProject): Promise<FundingRoute[]>;
}
