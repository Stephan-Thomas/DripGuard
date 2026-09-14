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

export interface MockFixtureData {
  projects?: Record<string, Partial<DripsProject>>;
  splits?: Record<string, { receiverRepo: string; weight: number; sharePercent: number }[]>;
  streams?: Record<string, Partial<FundingStream>[]>;
  fundedRepos?: string[]; // Repositories considered fully funded
  simulateOutage?: boolean;
}

export class MockDripsFundingProvider implements DripsFundingProvider {
  readonly name = 'MockDripsFundingProvider';
  readonly mode: ProviderMode = 'DEMO';

  constructor(private readonly fixtures: MockFixtureData = {}) {}

  async resolveProject(input: ProjectLookup): Promise<DripsProject | null> {
    if (this.fixtures.simulateOutage) {
      throw new DripsProviderError(
        'Simulated Drips provider network outage (fixture error)',
        'PROVIDER_UNAVAILABLE'
      );
    }

    const key = `${input.owner}/${input.repository}`.toLowerCase();
    const accountId = calcAccountId(input.forge, input.owner, input.repository);
    const custom = this.fixtures.projects?.[key];

    return {
      id: custom?.id || accountId,
      forge: input.forge,
      owner: input.owner,
      repo: input.repository,
      url: custom?.url || `https://${input.forge}.com/${input.owner}/${input.repository}`,
      accountId: custom?.accountId || accountId,
      claimed: custom?.claimed ?? true,
      ownerAddress: custom?.ownerAddress || '0x71C83d5a4dB0406853C3C0f1350a8c430B92B1b5'
    };
  }

  async getProjectFunding(project: DripsProject): Promise<ProjectFunding> {
    if (this.fixtures.simulateOutage) {
      throw new DripsProviderError(
        'Simulated Drips provider network outage (fixture error)',
        'PROVIDER_UNAVAILABLE'
      );
    }

    const projectKey = `${project.owner}/${project.repo}`.toLowerCase();
    const splits: FundingSplit[] = [];
    const routes: FundingRoute[] = [];
    const dependencies: DripsDependency[] = [];

    const fixtureSplits = this.fixtures.splits?.[projectKey];
    if (fixtureSplits) {
      for (const fs of fixtureSplits) {
        const [recvOwner, recvRepo] = fs.receiverRepo.split('/');
        const recvAccountId = calcAccountId('github', recvOwner, recvRepo);
        const recvProject: CanonicalProject = {
          forge: 'github',
          owner: recvOwner,
          repository: recvRepo,
          url: `https://github.com/${recvOwner}/${recvRepo}`
        };

        splits.push({
          receiver: recvAccountId,
          receiverProject: recvProject,
          weight: fs.weight,
          sharePercent: fs.sharePercent
        });

        routes.push({
          sourceProject: {
            forge: project.forge,
            owner: project.owner,
            repository: project.repo,
            url: project.url
          },
          targetProject: recvProject,
          routeType: 'direct_split',
          sharePercent: fs.sharePercent
        });

        dependencies.push({
          project: recvProject,
          weight: fs.weight,
          sharePercent: fs.sharePercent,
          isFunded: true
        });
      }
    } else {
      // Default mock split: if fundedRepos includes dependencies
      if (this.fixtures.fundedRepos) {
        const share = this.fixtures.fundedRepos.length > 0 ? 100 / this.fixtures.fundedRepos.length : 0;
        for (const repo of this.fixtures.fundedRepos) {
          const [o, r] = repo.split('/');
          const recvAccountId = calcAccountId('github', o, r);
          const recvProject: CanonicalProject = {
            forge: 'github',
            owner: o,
            repository: r,
            url: `https://github.com/${o}/${r}`
          };

          splits.push({
            receiver: recvAccountId,
            receiverProject: recvProject,
            weight: 1000,
            sharePercent: share
          });

          routes.push({
            sourceProject: {
              forge: project.forge,
              owner: project.owner,
              repository: project.repo,
              url: project.url
            },
            targetProject: recvProject,
            routeType: 'direct_split',
            sharePercent: share
          });

          dependencies.push({
            project: recvProject,
            sharePercent: share,
            isFunded: true
          });
        }
      }
    }

    const streams: FundingStream[] = [
      {
        sender: '0x1234567890123456789012345678901234567890',
        receiver: project.accountId,
        token: 'DAI',
        tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        chainId: 1,
        ratePerSecond: '380517503805', // ~1,000 DAI/month
        totalFunded: {
          raw: '5000000000000000000000',
          decimals: 18,
          symbol: 'DAI',
          humanAmount: '5000',
          derivedUsd: 5000
        },
        source: 'stream'
      }
    ];

    return {
      project,
      splits,
      streams,
      dependencies,
      routes,
      totalReceived: [
        {
          raw: '5000000000000000000000',
          decimals: 18,
          symbol: 'DAI',
          humanAmount: '5000',
          derivedUsd: 5000
        }
      ],
      providerMode: 'DEMO',
      lastUpdated: new Date().toISOString()
    };
  }

  async getProjectSplits(project: DripsProject): Promise<FundingSplit[]> {
    const res = await this.getProjectFunding(project);
    return res.splits;
  }

  async getProjectDependencies(project: DripsProject): Promise<DripsDependency[]> {
    const res = await this.getProjectFunding(project);
    return res.dependencies;
  }

  async getFundingRoutes(project: DripsProject): Promise<FundingRoute[]> {
    const res = await this.getProjectFunding(project);
    return res.routes;
  }
}
