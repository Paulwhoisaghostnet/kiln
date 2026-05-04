export type CoverageWallet = 'bert' | 'ernie' | 'user' | 'A' | 'B';

export interface CoverageContractInput {
  id: string;
  address?: string;
  entrypoints: string[];
}

export interface CoverageStepInput {
  wallet: CoverageWallet;
  targetContractId?: string;
  targetContractAddress?: string;
  entrypoint: string;
  args?: unknown[];
}

export interface EntrypointCoverageContract {
  id: string;
  address?: string;
  totalEntrypoints: number;
  coveredEntrypoints: number;
  missedEntrypoints: string[];
  byEntrypoint: Record<
    string,
    {
      calls: number;
      wallets: Array<'bert' | 'ernie' | 'user'>;
    }
  >;
}

export interface EntrypointCoverageReport {
  passed: boolean;
  totalEntrypoints: number;
  coveredEntrypoints: number;
  missedEntrypoints: string[];
  wallets: Array<'bert' | 'ernie' | 'user'>;
  contracts: EntrypointCoverageContract[];
}

function normalizeWallet(wallet: CoverageWallet): 'bert' | 'ernie' | 'user' {
  if (wallet === 'A') {
    return 'bert';
  }
  if (wallet === 'B') {
    return 'ernie';
  }
  return wallet;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeContracts(
  contracts: CoverageContractInput[],
): CoverageContractInput[] {
  return contracts.map((contract, index) => ({
    id: contract.id.trim() || `contract_${index + 1}`,
    address: contract.address?.trim() || undefined,
    entrypoints: unique(contract.entrypoints),
  }));
}

function findStepContract(
  contracts: CoverageContractInput[],
  step: CoverageStepInput,
): CoverageContractInput | undefined {
  const targetId = step.targetContractId?.trim();
  if (targetId) {
    return contracts.find((contract) => contract.id === targetId);
  }

  const targetAddress = step.targetContractAddress?.trim();
  if (targetAddress) {
    return contracts.find((contract) => contract.address === targetAddress);
  }

  return contracts.length === 1 ? contracts[0] : undefined;
}

export function generateEntrypointCoverageSteps(
  contracts: CoverageContractInput[],
): Array<{
  label: string;
  wallet: 'bert' | 'ernie';
  targetContractId: string;
  entrypoint: string;
  args: unknown[];
}> {
  const normalizedContracts = normalizeContracts(contracts);
  const wallets = ['bert', 'ernie'] as const;
  let index = 0;

  return normalizedContracts.flatMap((contract) =>
    contract.entrypoints.map((entrypoint) => {
      const wallet = wallets[index % wallets.length]!;
      index += 1;
      return {
        label: `${contract.id}.${entrypoint} (${wallet})`,
        wallet,
        targetContractId: contract.id,
        entrypoint,
        args: [],
      };
    }),
  );
}

export function buildEntrypointCoverage(input: {
  contracts: CoverageContractInput[];
  steps: CoverageStepInput[];
}): EntrypointCoverageReport {
  const contracts = normalizeContracts(input.contracts);
  const walletSet = new Set<'bert' | 'ernie' | 'user'>();

  const reports = contracts.map((contract) => {
    const byEntrypoint = Object.fromEntries(
      contract.entrypoints.map((entrypoint) => [
        entrypoint,
        { calls: 0, wallets: [] as Array<'bert' | 'ernie' | 'user'> },
      ]),
    ) as EntrypointCoverageContract['byEntrypoint'];

    for (const step of input.steps) {
      const stepContract = findStepContract(contracts, step);
      if (stepContract?.id !== contract.id) {
        continue;
      }

      const entrypoint = step.entrypoint.trim();
      const record = byEntrypoint[entrypoint];
      if (!record) {
        continue;
      }

      const wallet = normalizeWallet(step.wallet);
      walletSet.add(wallet);
      record.calls += 1;
      if (!record.wallets.includes(wallet)) {
        record.wallets.push(wallet);
      }
    }

    const missedEntrypoints = contract.entrypoints.filter(
      (entrypoint) => byEntrypoint[entrypoint]?.calls === 0,
    );

    return {
      id: contract.id,
      address: contract.address,
      totalEntrypoints: contract.entrypoints.length,
      coveredEntrypoints: contract.entrypoints.length - missedEntrypoints.length,
      missedEntrypoints,
      byEntrypoint,
    };
  });

  const missedEntrypoints = reports.flatMap((contract) =>
    contract.missedEntrypoints.map((entrypoint) => `${contract.id}.${entrypoint}`),
  );
  const totalEntrypoints = reports.reduce(
    (sum, contract) => sum + contract.totalEntrypoints,
    0,
  );
  const coveredEntrypoints = reports.reduce(
    (sum, contract) => sum + contract.coveredEntrypoints,
    0,
  );

  return {
    passed: missedEntrypoints.length === 0,
    totalEntrypoints,
    coveredEntrypoints,
    missedEntrypoints,
    wallets: Array.from(walletSet),
    contracts: reports,
  };
}
