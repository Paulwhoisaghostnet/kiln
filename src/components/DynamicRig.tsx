import React, { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
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
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [selectedWallet, setSelectedWallet] = useState<WalletType>('A');

  const handleInputChange = (entrypoint: string, argIndex: number, value: string) => {
    setFormValues(prev => ({
      ...prev,
      [`${entrypoint}_${argIndex}`]: value
    }));
  };

  const handleExecute = async (entrypoint: string, numArgs: number) => {
    setLoadingMap(prev => ({ ...prev, [entrypoint]: true }));
    try {
      const args = [];
      for (let i = 0; i < numArgs; i++) {
        args.push(formValues[`${entrypoint}_${i}`] || '');
      }
      await onExecute(entrypoint, args, selectedWallet);
    } finally {
      setLoadingMap(prev => ({ ...prev, [entrypoint]: false }));
    }
  };

  if (!contractAddress) {
    return (
      <div className="p-8 text-center text-base-content/50 border-2 border-dashed border-base-300 rounded-xl">
        Deploy a contract to generate the test rig.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-base-200 p-4 rounded-lg">
        <div>
          <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">Active Contract</h3>
          <p className="font-mono text-primary">{contractAddress}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-base-content/70">Execute as puppet wallet:</span>
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
                {entrypoint.args?.map((arg, argIdx: number) => (
                  <div key={argIdx} className="form-control w-full">
                    <label className="label py-1">
                      <span className="label-text text-xs font-mono">{arg.name || `arg${argIdx}`} ({arg.type})</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder={`Enter ${arg.type}...`}
                      className="input input-sm input-bordered w-full font-mono"
                      value={formValues[`${entrypoint.name}_${argIdx}`] || ''}
                      onChange={(e) => handleInputChange(entrypoint.name, argIdx, e.target.value)}
                    />
                  </div>
                ))}

                {(entrypoint.args?.length ?? 0) === 0 && (
                  <p className="text-xs text-base-content/60 font-mono">
                    No arguments required for this entrypoint.
                  </p>
                )}

                <button 
                  className="btn btn-sm btn-primary w-full mt-2"
                  onClick={() => handleExecute(entrypoint.name, entrypoint.args?.length || 0)}
                  disabled={loadingMap[entrypoint.name]}
                >
                  {loadingMap[entrypoint.name] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Execute
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {abi.length === 0 && (
          <div className="text-center p-4 text-base-content/50">
            No entrypoints found or ABI parsing not implemented for this format.
          </div>
        )}
      </div>
    </div>
  );
}
