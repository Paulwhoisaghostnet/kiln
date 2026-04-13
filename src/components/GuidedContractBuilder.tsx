import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Sparkles, Wand2 } from 'lucide-react';

type LogType = 'info' | 'error' | 'success';

type ContractType = 'fa2_fungible' | 'nft_collection' | 'marketplace';
type OutputFormat = 'smartpy' | 'michelson_stub';

interface GuidedDraftResponse {
  success: boolean;
  contractType: ContractType;
  outputFormat: OutputFormat;
  entrypoints: string[];
  code: string;
  initialStorage: string;
  guidance: string[];
  warnings: string[];
  selectedElements: string[];
  referenceInsights?: {
    availableElements: GuidedElementResponse[];
    selectedElements: GuidedElementResponse[];
    sourceContracts: Array<{
      slug: string;
      name: string;
      address: string | null;
    }>;
  };
}

interface GuidedElementsResponse {
  success: boolean;
  contractType: ContractType;
  count: number;
  elements: GuidedElementResponse[];
}

interface GuidedElementResponse {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  entrypoints: string[];
  evidenceContracts: Array<{
    slug: string;
    name: string;
    address: string | null;
  }>;
}

interface GuidedContractBuilderProps {
  buildHeaders: (includeJson?: boolean) => HeadersInit;
  onApplyMichelsonDraft: (code: string, initialStorage: string) => void;
  onLog: (message: string, type?: LogType) => void;
}

const contractTypeLabel: Record<ContractType, string> = {
  fa2_fungible: 'FA2 Fungible Token',
  nft_collection: 'NFT Collection',
  marketplace: 'Marketplace',
};

export default function GuidedContractBuilder({
  buildHeaders,
  onApplyMichelsonDraft,
  onLog,
}: GuidedContractBuilderProps) {
  const [contractType, setContractType] = useState<ContractType>('fa2_fungible');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('smartpy');
  const [projectName, setProjectName] = useState('My Kiln Contract');
  const [symbol, setSymbol] = useState('KILN');
  const [adminAddress, setAdminAddress] = useState('');
  const [decimals, setDecimals] = useState(6);
  const [initialSupply, setInitialSupply] = useState(1_000_000);
  const [maxCollectionSize, setMaxCollectionSize] = useState(10_000);
  const [marketplaceFeeBps, setMarketplaceFeeBps] = useState(250);
  const [royaltiesBps, setRoyaltiesBps] = useState(500);
  const [includeMint, setIncludeMint] = useState(true);
  const [includeBurn, setIncludeBurn] = useState(true);
  const [includePause, setIncludePause] = useState(true);
  const [includeAdminTransfer, setIncludeAdminTransfer] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingElements, setIsLoadingElements] = useState(false);
  const [referenceElements, setReferenceElements] = useState<GuidedElementResponse[]>(
    [],
  );
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [draft, setDraft] = useState<GuidedDraftResponse | null>(null);

  const primaryLabel = useMemo(() => {
    if (outputFormat === 'michelson_stub') {
      return 'Generate Deployable Michelson Stub';
    }
    return 'Generate SmartPy Scaffold';
  }, [outputFormat]);

  useEffect(() => {
    let ignore = false;

    const fetchReferenceElements = async () => {
      setIsLoadingElements(true);
      try {
        const response = await fetch('/api/kiln/contracts/guided/elements', {
          method: 'POST',
          headers: buildHeaders(true),
          body: JSON.stringify({ contractType }),
        });
        const payload = (await response.json()) as
          | GuidedElementsResponse
          | { error?: string };

        if (!response.ok || !('elements' in payload)) {
          throw new Error(
            'error' in payload && payload.error
              ? payload.error
              : 'Unable to load reference elements',
          );
        }

        if (ignore) {
          return;
        }

        setReferenceElements(payload.elements);
        setSelectedElements(
          payload.elements
            .filter((element) => element.recommended)
            .map((element) => element.id),
        );
      } catch (error) {
        if (!ignore) {
          setReferenceElements([]);
          setSelectedElements([]);
          onLog(
            `Reference element loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'error',
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingElements(false);
        }
      }
    };

    void fetchReferenceElements();

    return () => {
      ignore = true;
    };
  }, [contractType]);

  const toggleElement = (elementId: string, checked: boolean) => {
    setSelectedElements((current) => {
      if (checked) {
        return current.includes(elementId) ? current : [...current, elementId];
      }
      return current.filter((id) => id !== elementId);
    });
  };

  const generateDraft = async () => {
    setIsGenerating(true);
    onLog(`Generating ${contractTypeLabel[contractType]} draft from guided wizard...`, 'info');

    try {
      const response = await fetch('/api/kiln/contracts/guided/create', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          contractType,
          projectName,
          symbol,
          adminAddress: adminAddress.trim() || undefined,
          decimals,
          initialSupply,
          maxCollectionSize,
          marketplaceFeeBps,
          royaltiesBps,
          includeMint,
          includeBurn,
          includePause,
          includeAdminTransfer,
          selectedElements,
          outputFormat,
        }),
      });

      const payload = (await response.json()) as GuidedDraftResponse | { error?: string };
      if (!response.ok || !('code' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Draft generation failed');
      }

      setDraft(payload);
      onLog(`Guided draft generated for ${contractTypeLabel[contractType]}.`, 'success');
      for (const line of payload.guidance) {
        onLog(line, 'info');
      }
      for (const warning of payload.warnings) {
        onLog(`Guided warning: ${warning}`, 'info');
      }
      if (payload.referenceInsights?.sourceContracts.length) {
        onLog(
          `Reference evidence contracts: ${payload.referenceInsights.sourceContracts
            .map((contract) => contract.name)
            .join(', ')}`,
          'info',
        );
      }
    } catch (error) {
      onLog(
        `Guided creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const copyDraftCode = async () => {
    if (!draft?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.code);
      onLog('Guided contract code copied to clipboard.', 'success');
    } catch {
      onLog('Clipboard copy failed. You can still copy from the output textarea.', 'error');
    }
  };

  const applyMichelsonToInjector = () => {
    if (!draft) {
      return;
    }

    if (draft.outputFormat !== 'michelson_stub') {
      onLog('SmartPy output cannot be injected directly. Compile to .tz first.', 'info');
      return;
    }

    onApplyMichelsonDraft(draft.code, draft.initialStorage);
    onLog('Guided Michelson stub loaded into Contract Injector.', 'success');
  };

  return (
    <section className="bg-base-100 p-6 rounded-2xl shadow-lg border border-base-200 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Guided Contract Creator (Optional)
          </h2>
          <p className="text-sm text-base-content/60">
            Builder-first wizard for laymen and pros: choose contract shape, entrypoints, and output mode.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Contract Type</span>
          <select
            className="select select-sm select-bordered"
            value={contractType}
            onChange={(event) => setContractType(event.target.value as ContractType)}
          >
            <option value="fa2_fungible">FA2 Fungible Token</option>
            <option value="nft_collection">NFT Collection</option>
            <option value="marketplace">Marketplace</option>
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Output</span>
          <select
            className="select select-sm select-bordered"
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
          >
            <option value="smartpy">SmartPy Scaffold</option>
            <option value="michelson_stub">Michelson Test Stub</option>
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Project Name</span>
          <input
            className="input input-sm input-bordered"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="My Creator Contract"
          />
        </label>

        <label className="form-control">
          <span className="label-text text-xs uppercase tracking-wider">Admin Address (optional)</span>
          <input
            className="input input-sm input-bordered font-mono"
            value={adminAddress}
            onChange={(event) => setAdminAddress(event.target.value)}
            placeholder="tz1..."
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {contractType === 'fa2_fungible' && (
          <>
            <label className="form-control">
              <span className="label-text text-xs uppercase tracking-wider">Symbol</span>
              <input
                className="input input-sm input-bordered"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="KILN"
              />
            </label>
            <label className="form-control">
              <span className="label-text text-xs uppercase tracking-wider">Decimals</span>
              <input
                className="input input-sm input-bordered"
                type="number"
                value={decimals}
                min={0}
                max={18}
                onChange={(event) => setDecimals(Number(event.target.value))}
              />
            </label>
            <label className="form-control">
              <span className="label-text text-xs uppercase tracking-wider">Initial Supply</span>
              <input
                className="input input-sm input-bordered"
                type="number"
                value={initialSupply}
                min={0}
                onChange={(event) => setInitialSupply(Number(event.target.value))}
              />
            </label>
          </>
        )}

        {contractType === 'nft_collection' && (
          <>
            <label className="form-control">
              <span className="label-text text-xs uppercase tracking-wider">Max Collection Size</span>
              <input
                className="input input-sm input-bordered"
                type="number"
                value={maxCollectionSize}
                min={1}
                onChange={(event) => setMaxCollectionSize(Number(event.target.value))}
              />
            </label>
            <label className="form-control">
              <span className="label-text text-xs uppercase tracking-wider">Default Royalties (bps)</span>
              <input
                className="input input-sm input-bordered"
                type="number"
                value={royaltiesBps}
                min={0}
                max={10000}
                onChange={(event) => setRoyaltiesBps(Number(event.target.value))}
              />
            </label>
          </>
        )}

        {contractType === 'marketplace' && (
          <label className="form-control">
            <span className="label-text text-xs uppercase tracking-wider">Marketplace Fee (bps)</span>
            <input
              className="input input-sm input-bordered"
              type="number"
              value={marketplaceFeeBps}
              min={0}
              max={10000}
              onChange={(event) => setMarketplaceFeeBps(Number(event.target.value))}
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={includeMint}
            onChange={(event) => setIncludeMint(event.target.checked)}
          />
          <span className="label-text text-xs">Mint</span>
        </label>
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={includeBurn}
            onChange={(event) => setIncludeBurn(event.target.checked)}
          />
          <span className="label-text text-xs">Burn</span>
        </label>
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={includePause}
            onChange={(event) => setIncludePause(event.target.checked)}
          />
          <span className="label-text text-xs">Pause</span>
        </label>
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={includeAdminTransfer}
            onChange={(event) => setIncludeAdminTransfer(event.target.checked)}
          />
          <span className="label-text text-xs">Admin Transfer</span>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-base-content/70">
          Reference-Sliced Elements
        </p>
        <p className="text-xs text-base-content/60">
          These options are mined from real contracts in <span className="font-mono">reference/</span> and stitched into your guided draft.
        </p>
        {isLoadingElements ? (
          <div className="text-xs text-base-content/60">Loading reference elements...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {referenceElements.map((element) => {
              const checked = selectedElements.includes(element.id);
              return (
                <label
                  key={element.id}
                  className="p-2 rounded border border-base-300 text-xs cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{element.label}</span>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={checked}
                      onChange={(event) => toggleElement(element.id, event.target.checked)}
                    />
                  </div>
                  <p className="text-base-content/60 leading-snug">{element.description}</p>
                  <p className="text-base-content/50">
                    Evidence: {element.evidenceContracts.length} reference contracts
                  </p>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" onClick={generateDraft} disabled={isGenerating}>
          {isGenerating ? <span className="loading loading-spinner" /> : <Sparkles className="w-4 h-4" />}
          {primaryLabel}
        </button>
        <button className="btn btn-sm btn-outline" onClick={copyDraftCode} disabled={!draft}>
          <Copy className="w-4 h-4" />
          Copy Output
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={applyMichelsonToInjector}
          disabled={!draft || draft.outputFormat !== 'michelson_stub'}
        >
          Use In Contract Injector
        </button>
      </div>

      {draft && (
        <div className="space-y-2">
          <p className="text-xs text-base-content/60">
            Generated {draft.outputFormat === 'smartpy' ? 'SmartPy scaffold' : 'Michelson stub'} with entrypoints:{' '}
            <span className="font-mono">{draft.entrypoints.join(', ')}</span>
          </p>
          <textarea
            className="textarea textarea-bordered w-full h-56 font-mono text-xs"
            value={draft.code}
            readOnly
          />
          <p className="text-xs text-base-content/60 font-mono">
            Initial storage hint: {draft.initialStorage}
          </p>
        </div>
      )}
    </section>
  );
}
