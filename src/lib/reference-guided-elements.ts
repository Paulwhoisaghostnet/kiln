import { listReferenceContracts } from './reference-contracts.js';
import type { GuidedContractType } from './guided-contracts.js';

export type GuidedElementId =
  | 'admin_controls'
  | 'pause_guard'
  | 'operator_support'
  | 'permit_hook'
  | 'allowlist_gate'
  | 'metadata_freeze'
  | 'royalties'
  | 'market_fees';

export interface GuidedElementOption {
  id: GuidedElementId;
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

interface GuidedElementRule {
  id: GuidedElementId;
  label: string;
  description: string;
  recommendedFor: GuidedContractType[];
  entrypointPatterns: string[];
}

const GUIDED_ELEMENT_RULES: GuidedElementRule[] = [
  {
    id: 'admin_controls',
    label: 'Admin Transfer Controls',
    description:
      'Adds explicit set/confirm admin transfer logic for privileged entrypoints.',
    recommendedFor: ['fa2_fungible', 'nft_collection', 'marketplace'],
    entrypointPatterns: ['set_admin', 'confirm_admin', 'admin'],
  },
  {
    id: 'pause_guard',
    label: 'Pause Guard',
    description:
      'Adds emergency pause/unpause controls so runtime actions can be halted safely.',
    recommendedFor: ['fa2_fungible', 'nft_collection', 'marketplace'],
    entrypointPatterns: ['pause'],
  },
  {
    id: 'operator_support',
    label: 'FA2 Operator Support',
    description:
      'Adds update_operators scaffolding so wallets/marketplaces can act through operators.',
    recommendedFor: ['fa2_fungible', 'nft_collection'],
    entrypointPatterns: ['update_operators', 'operator'],
  },
  {
    id: 'permit_hook',
    label: 'Permit Hook',
    description:
      'Adds a permit-style entrypoint scaffold for signature-based approvals and relaying.',
    recommendedFor: ['fa2_fungible', 'nft_collection'],
    entrypointPatterns: ['permit'],
  },
  {
    id: 'allowlist_gate',
    label: 'Allowlist Gate',
    description:
      'Adds allowlist management entrypoints to gate mint/listing/buy flows.',
    recommendedFor: ['fa2_fungible', 'nft_collection', 'marketplace'],
    entrypointPatterns: ['allowlist', 'set_allowlist'],
  },
  {
    id: 'metadata_freeze',
    label: 'Metadata Freeze',
    description:
      'Adds one-way metadata freeze control for collection integrity hardening.',
    recommendedFor: ['nft_collection'],
    entrypointPatterns: ['freeze_metadata'],
  },
  {
    id: 'royalties',
    label: 'Royalties Controls',
    description:
      'Adds royalties parameter management entrypoint scaffolding.',
    recommendedFor: ['nft_collection', 'marketplace'],
    entrypointPatterns: ['royalty', 'set_royalty'],
  },
  {
    id: 'market_fees',
    label: 'Marketplace Fee Controls',
    description:
      'Adds fee bps controls for marketplace revenue logic and constraints.',
    recommendedFor: ['marketplace'],
    entrypointPatterns: ['set_fee_bps', 'fee'],
  },
];

function matchesPattern(entrypoint: string, pattern: string): boolean {
  const normalizedEntrypoint = entrypoint.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  return normalizedEntrypoint.includes(normalizedPattern);
}

function isRuleRelevantForContractType(
  rule: GuidedElementRule,
  contractType: GuidedContractType,
): boolean {
  return rule.recommendedFor.includes(contractType);
}

export async function listGuidedElementsFromReferences(
  contractType: GuidedContractType,
): Promise<GuidedElementOption[]> {
  const contracts = await listReferenceContracts();
  const relevantRules = GUIDED_ELEMENT_RULES.filter((rule) =>
    isRuleRelevantForContractType(rule, contractType),
  );

  return relevantRules.map((rule) => {
    const evidenceContracts = contracts.filter((contract) =>
      contract.entrypoints.some((entrypoint) =>
        rule.entrypointPatterns.some((pattern) =>
          matchesPattern(entrypoint, pattern),
        ),
      ),
    );

    return {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      recommended: rule.recommendedFor.includes(contractType),
      entrypoints: rule.entrypointPatterns,
      evidenceContracts: evidenceContracts.slice(0, 8).map((contract) => ({
        slug: contract.slug,
        name: contract.name,
        address: contract.address,
      })),
    };
  });
}

