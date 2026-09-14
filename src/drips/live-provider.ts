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
        const meta = resolveTokenMetadata(st.tokenAddress, st.token || st.totalFunded?.symbol, st.totalFunded?.decimals);

        let totalFunded: FundingAmount | undefined;
        if (st.totalFunded) {
          const raw = String(st.totalFunded.raw || '0');
          const human = formatTokenAmount(raw, meta.decimals);

          // Only derive USD for verified 1:1 USD stablecoins; do not fabricate USD for volatile tokens
          let derivedUsd: number | undefined;
          if (meta.symbol === 'DAI' || meta.symbol === 'USDC' || meta.symbol === 'USDT') {
            const parsed = parseFloat(human);
            if (!isNaN(parsed)) derivedUsd = parsed;
          }

          totalFunded = {
            raw,
            decimals: meta.decimals,
            symbol: meta.symbol,
            tokenAddress: meta.tokenAddress,
            chainId: st.chainId,
            humanAmount: human,
            derivedUsd
          };
        }

        streams.push({
          sender: st.sender,
          receiver: st.receiver,
          token: meta.symbol || st.token || (st.tokenAddress ? `ERC20(${st.tokenAddress.substring(0, 8)}...)` : 'UNKNOWN'),
          tokenAddress: meta.tokenAddress,
          chainId: st.chainId,
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
          'User-Agent': 'DripGuard/1.0.0'
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

interface TokenMetadata {
  tokenAddress?: string;
  symbol: string;
  decimals: number;
}

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  // Mainnet
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  // Optimism
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', decimals: 6 },
  '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  // Base
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6 }
};

function resolveTokenMetadata(
  tokenAddress?: string,
  hintSymbol?: string,
  hintDecimals?: number
): TokenMetadata {
  const normAddr = tokenAddress?.toLowerCase();
  if (normAddr && KNOWN_TOKENS[normAddr]) {
    const known = KNOWN_TOKENS[normAddr];
    return {
      tokenAddress,
      symbol: hintSymbol || known.symbol,
      decimals: hintDecimals !== undefined && !isNaN(hintDecimals) ? hintDecimals : known.decimals
    };
  }

  const symbol = hintSymbol || (tokenAddress ? `TOKEN(${tokenAddress.slice(0, 6)}...)` : 'DAI');
  const decimals = hintDecimals !== undefined && !isNaN(hintDecimals) ? hintDecimals : 18;

  return {
    tokenAddress,
    symbol,
    decimals
  };
}

