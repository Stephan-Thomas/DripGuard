import {
  ConcentrationMetric,
  CoverageResult,
  DependencyFundingStatus,
  DriftAnalysis,
  PolicyViolation,
  ProjectFunding,
  ResolvedDependency
} from '../core/types.js';
import { DripsConfig } from '../config/schema.js';

export interface PolicyContext {
  config: DripsConfig;
  dependencies: DependencyFundingStatus[];
  coverage: CoverageResult;
  projectFunding?: ProjectFunding;
  baselineDependencies?: ResolvedDependency[];
  drift?: DriftAnalysis;
  concentration?: ConcentrationMetric;
}

export interface PolicyRule {
  readonly id: string;
  readonly description: string;
  evaluate(context: PolicyContext): PolicyViolation[];
}
