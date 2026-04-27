import type { RuntimeNetworkConfig } from './networks.js';

export function buildOpenApiSpec(
  runtimeNetwork: RuntimeNetworkConfig,
  options?: {
    deployClearanceRequired?: boolean;
    shadowboxRequiredForClearance?: boolean;
  },
) {
  const deployClearanceRequired = options?.deployClearanceRequired ?? true;
  const shadowboxRequiredForClearance =
    options?.shadowboxRequiredForClearance ?? false;

  return {
    openapi: '3.1.0',
    info: {
      title: 'Kiln API',
      version: '1.0.0',
      description:
        'Kiln staged contract workflow API for SmartPy/Michelson intake, simulation, audit, clearance, and deployment.',
    },
    servers: [
      {
        url: '/',
        description: 'Current origin',
      },
    ],
    tags: [
      { name: 'health' },
      { name: 'workflow' },
      { name: 'deployment' },
      { name: 'operations' },
      { name: 'reference' },
    ],
    'x-kiln': {
      defaultNetwork: runtimeNetwork.id,
      defaultRpcUrl: runtimeNetwork.rpcUrl,
      chainId: runtimeNetwork.chainId ?? null,
      sourceTypes: ['auto', 'smartpy', 'michelson'],
      puppetWallets: ['bert', 'ernie'],
      deployWallets: ['A', 'B', 'connected'],
      clearanceRequiredByDefault: deployClearanceRequired,
      deployClearanceRequired,
      shadowboxRequiredForClearance,
      shadowboxRuntime: {
        endpoint: '/api/kiln/shadowbox/run',
        mode: 'ephemeral_tezos_runtime',
      },
    },
    paths: {
      '/api/health': {
        get: {
          tags: ['health'],
          summary: 'Runtime health and active network metadata',
        },
      },
      '/api/networks': {
        get: {
          tags: ['health'],
          summary: 'Supported network catalog',
        },
      },
      '/api/kiln/capabilities': {
        get: {
          tags: ['workflow'],
          summary: 'Machine-readable capabilities for UI/CLI/agents',
        },
      },
      '/api/kiln/workflow/run': {
        post: {
          tags: ['workflow'],
          summary:
            'Run compile -> validation -> audit -> simulation -> shadowbox and issue deployment clearance when required gates pass',
        },
      },
      '/api/kiln/contracts/guided/elements': {
        post: {
          tags: ['workflow'],
          summary:
            'Return reference-informed contract elements for guided composition',
        },
      },
      '/api/kiln/audit/run': {
        post: {
          tags: ['workflow'],
          summary: 'Run static Michelson audit stage only',
        },
      },
      '/api/kiln/simulate/run': {
        post: {
          tags: ['workflow'],
          summary:
            'Run simulation stage only; simulation clearance is withheld when shadowbox is required',
        },
      },
      '/api/kiln/shadowbox/run': {
        post: {
          tags: ['workflow'],
          summary:
            'Run ephemeral shadowbox runtime stage (temporary origin + entrypoint interactions); returns success only when runtime executes and passes',
        },
      },
      '/api/kiln/predeploy/validate': {
        post: {
          tags: ['workflow'],
          summary: 'Run structural and RPC estimate validation stage',
        },
      },
      '/api/kiln/upload': {
        post: {
          tags: ['deployment'],
          summary:
            'Originate contract from puppet wallet signer; optionally requires clearanceId',
        },
      },
      '/api/kiln/execute': {
        post: {
          tags: ['operations'],
          summary: 'Execute contract entrypoint from puppet wallet signer',
        },
      },
      '/api/kiln/e2e/run': {
        post: {
          tags: ['operations'],
          summary: 'Run post-deploy Bert/Ernie entrypoint sequence',
        },
      },
      '/api/kiln/balances': {
        get: {
          tags: ['operations'],
          summary: 'Fetch puppet wallet balances and addresses',
        },
      },
      '/api/kiln/activity/recent': {
        get: {
          tags: ['operations'],
          summary: 'Tail recent request/workflow audit logs',
        },
      },
      '/api/kiln/export/bundle': {
        post: {
          tags: ['operations'],
          summary:
            'Create mainnet-readiness zip with contract artifacts and workflow reports',
        },
      },
      '/api/kiln/export/download/{fileName}': {
        get: {
          tags: ['operations'],
          summary: 'Download previously exported bundle zip',
        },
      },
      '/api/kiln/reference/contracts': {
        get: {
          tags: ['reference'],
          summary: 'List reference contracts and discovered entrypoints',
        },
      },
    },
  };
}
