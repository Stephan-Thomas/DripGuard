/**
 * Core domain types and interfaces for DripGuard.
 * DripGuard enforces alignment between software dependencies and Drips funding graphs.
 */

export type Ecosystem = 'npm' | 'cargo' | 'go' | 'pypi';

export type Forge = 'github' | 'gitlab';

export interface RepositoryFileSet {
  hasFile(path: string): boolean;
  readFile(path: string): string | null;
  listFiles(pattern?: string | RegExp): string[];
  rootPath: string;
}

export interface Dependency {
  name: string;
  ecosystem: Ecosystem;
  version?: string;
  direct: boolean;
  dev: boolean;
  optional: boolean;
  sourceFile: string;
  workspace?: string;
}

export interface CanonicalProject {
  forge: Forge;
  owner: string;
  repository: string;
  url: string;
}

export type ResolutionStatus = 'resolved' | 'ambiguous' | 'unknown' | 'unsupported';

export type ResolutionSource =
  | 'manifest'
  | 'lockfile'
  | 'registry'
  | 'manual_override'
  | 'heuristic'
  | 'unresolved';

export interface ResolvedDependency {
  dependency: Dependency;
  project?: CanonicalProject;
  resolutionStatus: ResolutionStatus;
  resolutionSource: ResolutionSource;
  resolutionDetails?: string;
}

export interface FundingAmount {
  raw: string;
  decimals: number;
  symbol?: string;
  tokenAddress?: string;
  chainId?: number | string;
  humanAmount: string;
  derivedUsd?: number;
}

export interface FundingSplit {
  receiver: string; // accountId or address
  receiverProject?: CanonicalProject;
  weight: number; // raw basis points
  sharePercent: number; // 0 - 100
}

export interface FundingStream {
  sender: string;
  receiver: string;
  receiverProject?: CanonicalProject;
  token: string;
  tokenAddress?: string;
  chainId?: number | string;
  ratePerSecond?: string;
  totalFunded?: FundingAmount;
  source: 'stream' | 'split' | 'drip_list' | 'one_time';
}

export interface DripsDependency {
  project: CanonicalProject;
  weight?: number;
  sharePercent?: number;
  isFunded: boolean;
}

export interface FundingRoute {
  sourceProject: CanonicalProject;
  targetProject: CanonicalProject;
  routeType: 'direct_split' | 'nested_split' | 'stream' | 'drip_list';
  sharePercent: number;
}

export interface DripsProject {
  id: string; // internal or query ID
  forge: Forge;
  owner: string;
  repo: string;
  url: string;
  accountId: string; // uint256 string from RepoDriver
  driverId?: number;
  claimed: boolean;
  ownerAddress?: string;
}

export type ProviderMode = 'LIVE' | 'DEMO' | 'UNAVAILABLE' | 'PARTIAL';

export interface ProjectFunding {
  project: DripsProject;
  splits: FundingSplit[];
  streams: FundingStream[];
  dependencies: DripsDependency[];
  routes: FundingRoute[];
  totalReceived: FundingAmount[];
  providerMode: ProviderMode;
  lastUpdated: string;
}

export type FundingClassification =
  | 'FUNDED'
  | 'PARTIALLY_FUNDED'
  | 'UNFUNDED'
  | 'UNKNOWN'
  | 'UNRESOLVED'
  | 'EXEMPT';

export interface DependencyFundingStatus {
  resolvedDependency: ResolvedDependency;
  dripsProject?: DripsProject;
  classification: FundingClassification;
  evidence?: string;
  allocatedSharePercent?: number;
  exemptionReason?: string;
}

export interface CoverageResult {
  totalDependencies: number;
  resolvedDependencies: number;
  fundedDependencies: number;
  partiallyFundedDependencies: number;
  unfundedDependencies: number;
  unknownDependencies: number;
  unresolvedDependencies: number;
  exemptDependencies: number;
  coveragePercent: number;
  directTotal: number;
  directFunded: number;
  directCoveragePercent: number;
}

export interface ConcentrationMetric {
  maxSingleRecipient: {
    receiver: string;
    project?: CanonicalProject;
    sharePercent: number;
  };
  herfindahlHirschmanIndex: number; // HHI: 0 to 10,000
  effectiveRecipientsCount: number; // 10,000 / HHI
}

export interface DriftAnalysis {
  addedDependencies: ResolvedDependency[];
  removedDependencies: ResolvedDependency[];
  newUnfundedDependencies: DependencyFundingStatus[];
  staleFundingCandidates: {
    project: CanonicalProject;
    sharePercent: number;
    reason: string;
  }[];
  coverageBefore?: number;
  coverageAfter: number;
  coverageDelta?: number;
}

export type PolicySeverity = 'error' | 'warning';

export interface PolicyViolation {
  rule: string;
  severity: PolicySeverity;
  message: string;
  dependency?: string;
  project?: string;
  details?: Record<string, unknown>;
}

export enum ExitCode {
  PASS = 0,
  POLICY_VIOLATION = 1,
  CONFIGURATION_ERROR = 2,
  PROVIDER_UNAVAILABLE = 3,
  INTERNAL_ERROR = 4
}

export interface DripGuardResult {
  status: 'pass' | 'fail' | 'warn' | 'error';
  exitCode: ExitCode;
  timestamp: string;
  repository: string;
  commitSha?: string;
  detectedEcosystems: Ecosystem[];
  coverage: CoverageResult;
  concentration?: ConcentrationMetric;
  drift?: DriftAnalysis;
  dependencies: DependencyFundingStatus[];
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  providerMode: ProviderMode;
  executionDurationMs: number;
}
