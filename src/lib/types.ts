export type WalletType = 'A' | 'B';

export interface AbiArg {
  name: string;
  type: string;
}

export interface AbiEntrypoint {
  name: string;
  args: AbiArg[];
  parameterType?: string;
  sampleArgs?: string[];
}

export interface ContractCallResult {
  hash: string;
  level: number | null;
  status?: string;
}
