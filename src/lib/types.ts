export type WalletType = 'A' | 'B';

export interface AbiArg {
  name: string;
  type: string;
}

export interface AbiEntrypoint {
  name: string;
  args: AbiArg[];
}

export interface ContractCallResult {
  hash: string;
  level: number;
  status?: string;
}
