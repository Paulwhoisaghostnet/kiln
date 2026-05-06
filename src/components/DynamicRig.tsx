import React, { useEffect, useMemo, useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useKilnView } from '../context/KilnViewProvider';
import type { AbiEntrypoint, WalletType } from '../lib/types';

interface DynamicRigProps {
  contractAddress: string;
  abi: AbiEntrypoint[];
  onExecute: (entrypoint: string, args: unknown[], wallet: WalletType) => Promise<void>;
}

const puppetWalletLabels: Record<WalletType, string> = {
  A: 'Bert',
  B: 'Ernie',
};

export default function DynamicRig({ contractAddress, abi, onExecute }: DynamicRigProps) {
  const { mode, t, tip } = useKilnView();
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [selectedWallet, setSelectedWallet] = useState<WalletType>('A');

  const defaultArgsByEntrypoint = useMemo(
    () =>
      Object.fromEntries(
        abi.map((entrypoint) => [
          entrypoint.name,
          JSON.stringify(entrypoint.sampleJsArgs ?? [], null, 2),
        ]),
      ),
    [abi],
  );

  useEffect(() => {
    setFormValues((prev) => {
      const next = { ...prev };
      for (const [entrypoint, defaultArgs] of Object.entries(defaultArgsByEntrypoint)) {
        if (next[entrypoint] === undefined) {
          next[entrypoint] = defaultArgs;
        }
      }
      return next;
    });
  }, [defaultArgsByEntrypoint]);

  const handleInputChange = (entrypoint: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [entrypoint]: value,
    }));
  };

  const handleExecute = async (entrypoint: AbiEntrypoint) => {
    setLoadingMap(prev => ({ ...prev, [entrypoint.name]: true }));
    try {
      const raw = formValues[entrypoint.name] ?? defaultArgsByEntrypoint[entrypoint.name] ?? '[]';
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('Entrypoint args must be a JSON array.');
      }
      await onExecute(entrypoint.name, parsed, selectedWallet);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Invalid JSON args.');
    } finally {
      setLoadingMap(prev => ({ ...prev, [entrypoint.name]: false }));
    }
  };

  if (!contractAddress) {
    return (
      <div
        className={`p-8 text-center text-base-content/50 border-2 border-dashed border-base-300 rounded-xl ${mode === 'eli5' && tip('dynamicRigEmptyState') ? 'cursor-help underline decoration-dotted decoration-base-content/30 underline-offset-4' : ''}`}
        title={mode === 'eli5' ? tip('dynamicRigEmptyState') : undefined}
      >
        {t('dynamicRigEmptyState')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-base-200 p-4 rounded-lg">
        <div>
          <h3
            className={`text-sm font-semibold text-base-content/70 uppercase tracking-wider ${mode === 'eli5' && tip('dynamicRigActiveContract') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
            title={mode === 'eli5' ? tip('dynamicRigActiveContract') : undefined}
          >
            {t('dynamicRigActiveContract')}
          </h3>
          <p className="font-mono text-primary">{contractAddress}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-sm text-base-content/70 ${mode === 'eli5' && tip('dynamicRigExecuteAs') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
            title={mode === 'eli5' ? tip('dynamicRigExecuteAs') : undefined}
          >
            {t('dynamicRigExecuteAs')}
          </span>
          <select 
            className="select select-sm select-bordered"
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value as 'A' | 'B')}
          >
            <option value="A">{puppetWalletLabels.A}</option>
            <option value="B">{puppetWalletLabels.B}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {abi.map((entrypoint, idx) => (
          <div key={idx} className="card bg-base-200 shadow-sm border border-base-300">
            <div className="card-body p-4">
              <h4 className="card-title text-lg font-mono text-secondary">{entrypoint.name}</h4>
              
              <div className="space-y-3 mt-4">
                {(entrypoint.args?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {entrypoint.args.map((arg, argIdx: number) => (
                      <span key={`${arg.name}-${argIdx}`} className="badge badge-outline font-mono">
                        {arg.name || `arg${argIdx}`}:{arg.type}
                      </span>
                    ))}
                  </div>
                ) : null}

                {(entrypoint.args?.length ?? 0) === 0 && (entrypoint.sampleJsArgs?.length ?? 0) === 0 ? (
                  <p
                    className={`text-xs text-base-content/60 font-mono ${mode === 'eli5' && tip('dynamicRigNoArgs') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
                    title={mode === 'eli5' ? tip('dynamicRigNoArgs') : undefined}
                  >
                    {t('dynamicRigNoArgs')}
                  </p>
                ) : null}

                <textarea
                  className="textarea textarea-bordered w-full min-h-24 font-mono text-xs bg-base-300/50"
                  value={formValues[entrypoint.name] ?? defaultArgsByEntrypoint[entrypoint.name] ?? '[]'}
                  onChange={(event) => handleInputChange(entrypoint.name, event.target.value)}
                  spellCheck={false}
                  aria-label={`${entrypoint.name} JSON arguments`}
                />

                <button
                  title={tip('dynamicRigExecute') ?? undefined}
                  className="btn btn-sm btn-primary w-full mt-2"
                  onClick={() => handleExecute(entrypoint)}
                  disabled={loadingMap[entrypoint.name]}
                >
                  {loadingMap[entrypoint.name] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {t('dynamicRigExecute')}
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {abi.length === 0 && (
          <div
            className={`text-center p-4 text-base-content/50 ${mode === 'eli5' && tip('dynamicRigNoEntrypoints') ? 'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2' : ''}`}
            title={mode === 'eli5' ? tip('dynamicRigNoEntrypoints') : undefined}
          >
            {t('dynamicRigNoEntrypoints')}
          </div>
        )}
      </div>
    </div>
  );
}
