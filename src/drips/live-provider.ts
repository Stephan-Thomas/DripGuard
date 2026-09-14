import {
  CanonicalProject,
  DripsDependency,
  DripsProject,
  FundingAmount,
  FundingRoute,
  FundingSplit,
  FundingStream,
  ProjectFunding,
  ProviderMode
} from '../core/types.js';
import { calcAccountId } from './repodriver.js';
import { DripsFundingProvider, DripsProviderError, ProjectLookup } from './interface.js';

export interface LiveProviderOptions {
  endpoint?: string;
  timeoutMs?: number;
  maxRetries?: number;
  apiKey?: string;
}

const DEFAULT_GRAPHQL_ENDPOINT = 'https://api.drips.network/';

export class LiveDripsFundingProvider implements DripsFundingProvider {
  readonly name = 'LiveDripsFundingProvider';
  readonly mode: ProviderMode = 'LIVE';

  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly apiKey?: string;

  constructor(options: LiveProviderOptions = {}) {
    this.endpoint = options.endpoint || process.env.DRIPS_GRAPHQL_ENDPOINT || DEFAULT_GRAPHQL_ENDPOINT;
    this.timeoutMs = options.timeoutMs || 5000;
    this.maxRetries = options.maxRetries ?? 2;
    this.apiKey = options.apiKey || process.env.DRIPS_API_KEY;
  }

  async resolveProject(input: ProjectLookup): Promise<DripsProject | null> {
    const accountId = calcAccountId(input.forge, input.owner, input.repository);

    const query = `
      query GetProjectByRepo($forge: String!, $owner: String!, $name: String!) {
        project(forge: $forge, owner: $owner, name: $name) {
          id
          forge
          owner
          name
          url
          accountId
          claimed
          ownerAddress
        }
      }
    `;

    try {
      const data = await this.queryGraphQL<any>(query, {
        forge: input.forge,
        owner: input.owner,
        name: input.repository
      });

      if (data?.project) {
        return {
          id: data.project.id || accountId,
          forge: input.forge,
          owner: input.owner,
          repo: input.repository,
          url: data.project.url || `https://${input.forge}.com/${input.owner}/${input.repository}`,
          accountId: data.project.accountId || accountId,
          claimed: Boolean(data.project.claimed),
          ownerAddress: data.project.ownerAddress
        };
      }

      // If project has no on-chain claimed state yet, we still know its deterministic accountId
      return {
        id: accountId,
        forge: input.forge,
        owner: input.owner,
        repo: input.repository,
        url: `https://${input.forge}.com/${input.owner}/${input.repository}`,
        accountId,
        claimed: false
      };
    } catch (err: unknown) {
      // Re-throw typed error so caller knows provider is unavailable
      throw new DripsProviderError(
        `Failed to resolve live Drips project for ${input.owner}/${input.repository} via ${this.endpoint}: ${err instanceof Error ? err.message : String(err)}`,
        'PROVIDER_UNAVAILABLE',
        err
      );
    }
  }

  async getProjectFunding(project: DripsProject): Promise<ProjectFunding> {
    const query = `
      query GetProjectFundingDetails($accountId: ID!) {
        project(accountId: $accountId) {
          splits {
            receiver
            weight
          }
          streams {
            sender
            receiver
            token
            tokenAddress
            chainId
            ratePerSecond
            totalFunded {
              raw
              decimals
              symbol
            }
          }
        }
      }
    `;

    try {
      const data = await this.queryGraphQL<any>(query, { accountId: project.accountId });
      const splits: FundingSplit[] = [];
      const streams: FundingStream[] = [];
      const routes: FundingRoute[] = [];
      const dependencies: DripsDependency[] = [];

      const rawSplits = data?.project?.splits || [];
      let totalWeight = 0;
      for (const s of rawSplits) {
        totalWeight += Number(s.weight || 0);
      }

      for (const s of rawSplits) {
        const weight = Number(s.weight || 0);
        const sharePercent = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
        splits.push({
          receiver: s.receiver,
          weight,
          sharePercent
        });
      }

      const rawStreams = data?.project?.streams || [];
      for (const st of rawStreams) {
        let totalFunded: FundingAmount | undefined;
        if (st.totalFunded) {
          const raw = String(st.totalFunded.raw || '0');
          const decimals = Number(st.totalFunded.decimals || 18);
          totalFunded = {
            raw,
            decimals,
            symbol: st.totalFunded.symbol || 'DAI',
            tokenAddress: st.tokenAddress,
            chainId: st.chainId || 1,
            humanAmount: formatTokenAmount(raw, decimals)
          };
        }

        streams.push({
          sender: st.sender,
          receiver: st.receiver,
          token: st.token || 'DAI',
          tokenAddress: st.tokenAddress,
          chainId: st.chainId || 1,
          ratePerSecond: st.ratePerSecond,
          totalFunded,
          source: 'stream'
        });
      }

      return {
        project,
        splits,
        streams,
        dependencies,
        routes,
        totalReceived: [],
        providerMode: 'LIVE',
        lastUpdated: new Date().toISOString()
      };
    } catch (err: unknown) {
      throw new DripsProviderError(
        `Failed to retrieve live Drips funding for account ${project.accountId}: ${err instanceof Error ? err.message : String(err)}`,
        'PROVIDER_UNAVAILABLE',
        err
      );
    }
  }

  async getProjectSplits(project: DripsProject): Promise<FundingSplit[]> {
    const funding = await this.getProjectFunding(project);
    return funding.splits;
  }

  async getProjectDependencies(project: DripsProject): Promise<DripsDependency[]> {
    const funding = await this.getProjectFunding(project);
    return funding.dependencies;
  }

  async getFundingRoutes(project: DripsProject): Promise<FundingRoute[]> {
    const funding = await this.getProjectFunding(project);
    return funding.routes;
  }

  private async queryGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'DripGuard/0.1.0'
        };
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables }),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const json = await res.json() as { data?: T; errors?: { message: string }[] };
        if (json.errors && json.errors.length > 0) {
          throw new Error(json.errors.map(e => e.message).join(', '));
        }

        return json.data as T;
      } catch (err: unknown) {
        lastError = err;
        if (attempt < this.maxRetries) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  }
}

function formatTokenAmount(raw: string, decimals: number): string {
  try {
    const bi = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);
    const integerPart = bi / divisor;
    const remainder = bi % divisor;
    const remStr = remainder.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
    return remStr ? `${integerPart}.${remStr}` : integerPart.toString();
  } catch {
    return '0';
  }
}
