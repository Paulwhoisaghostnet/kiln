import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TezosService } from '../src/lib/tezos-service.js';
import { getEnv } from '../src/lib/env.js';

dotenv.config();

const TOKEN_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
const STORAGE_PLACEHOLDER = 'tz1burnburnburnburnburnburnburjAYjjX';

type WalletChoice = 'A' | 'B';
type TokenName = (typeof TOKEN_ORDER)[number];

async function main() {
  const env = getEnv();
  const deployerChoice = (process.env.DUMMY_TOKEN_DEPLOYER ?? 'A').toUpperCase();
  if (deployerChoice !== 'A' && deployerChoice !== 'B') {
    throw new Error('DUMMY_TOKEN_DEPLOYER must be either "A" or "B".');
  }

  const requestedToken = process.env.DUMMY_TOKEN_ONLY?.trim().toLowerCase();
  if (requestedToken && !TOKEN_ORDER.includes(requestedToken as TokenName)) {
    throw new Error(
      `DUMMY_TOKEN_ONLY must be one of: ${TOKEN_ORDER.join(', ')}`,
    );
  }

  const tokensToDeploy = requestedToken
    ? [requestedToken as TokenName]
    : [...TOKEN_ORDER];

  const deployer = new TezosService(deployerChoice as WalletChoice, env);
  const deployerAddress = await deployer.getAddress();

  console.log(
    `Deploying ${tokensToDeploy.length} FA2 test token(s) from ${deployerAddress} (wallet ${deployerChoice})...`,
  );

  const addresses: string[] = [];
  for (let i = 0; i < tokensToDeploy.length; i += 1) {
    const tokenName = tokensToDeploy[i];
    const codePath = resolve(`contracts/tokens/test-${tokenName}.tz`);
    const storagePath = resolve(`contracts/tokens/test-${tokenName}.storage.tz`);
    const code = readFileSync(codePath, 'utf8');
    const rawStorage = readFileSync(storagePath, 'utf8');
    const storage = rawStorage.replaceAll(STORAGE_PLACEHOLDER, deployerAddress);

    console.log(
      `\n[${i + 1}/${tokensToDeploy.length}] Originating test-${tokenName} from ${codePath}...`,
    );
    const address = await deployer.originateContract(code, storage);
    addresses.push(address);
    console.log(
      `[${i + 1}/${tokensToDeploy.length}] test-${tokenName} deployed at ${address}`,
    );
  }

  console.log('\nFA2 test token contracts ready.');
  console.log(`KILN_DUMMY_TOKENS=${addresses.join(',')}`);
}

main().catch((error) => {
  console.error('Failed to deploy FA2 test tokens:', error);
  process.exit(1);
});
