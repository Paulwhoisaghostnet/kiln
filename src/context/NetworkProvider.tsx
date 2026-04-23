import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getDefaultNetworkId,
  getNetworkProfile,
  isKilnNetworkId,
  listPickableNetworks,
  type KilnEcosystem,
  type KilnNetworkId,
  type KilnNetworkProfile,
} from '../lib/networks.js';

const STORAGE_KEY = 'kilnSelectedNetwork';
const MAINNET_CONSENT_KEY = 'kilnMainnetConsentGranted';

type Capabilities = KilnNetworkProfile['capabilities'];
type BooleanCapability = {
  [K in keyof Capabilities]: Capabilities[K] extends boolean ? K : never;
}[keyof Capabilities];

export interface NetworkContextValue {
  /** The id currently in-use across every request + wallet flow. */
  networkId: KilnNetworkId;
  /** Full profile for `networkId`. Stable reference until the id changes. */
  network: KilnNetworkProfile;
  /** Ordered list of networks the UI lets you pick. */
  pickable: KilnNetworkProfile[];
  /** True when we should show the "this is real funds" modal before committing to a new id. */
  pendingMainnetConsent: KilnNetworkId | null;
  /**
   * Request a network switch. For mainnets we stash the request and show the
   * consent modal; the UI confirms via `confirmMainnetConsent()`.
   */
  requestNetworkChange: (next: KilnNetworkId) => void;
  /** Consent step — actually performs the switch once the user acknowledges risk. */
  confirmMainnetConsent: () => void;
  /** Dismiss the consent modal without switching. */
  cancelMainnetConsent: () => void;
  /** Predicate: can this network run the given boolean capability? */
  can: (capability: BooleanCapability) => boolean;
  /** Sugar helpers for branching UI by ecosystem. */
  isTezos: boolean;
  isEvm: boolean;
  /** Ecosystem of the active network. */
  ecosystem: KilnEcosystem;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

function readStoredNetworkId(): KilnNetworkId {
  if (typeof window === 'undefined') {
    return getDefaultNetworkId();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isKilnNetworkId(raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return getDefaultNetworkId();
}

function readStoredConsent(): Record<KilnNetworkId, boolean> {
  if (typeof window === 'undefined') {
    return {} as Record<KilnNetworkId, boolean>;
  }
  try {
    const raw = window.localStorage.getItem(MAINNET_CONSENT_KEY);
    if (!raw) {
      return {} as Record<KilnNetworkId, boolean>;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<KilnNetworkId, boolean>;
    }
  } catch {
    /* ignore */
  }
  return {} as Record<KilnNetworkId, boolean>;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [networkId, setNetworkId] = useState<KilnNetworkId>(() => readStoredNetworkId());
  const [pendingMainnet, setPendingMainnet] = useState<KilnNetworkId | null>(null);
  const [consentMap, setConsentMap] = useState<Record<KilnNetworkId, boolean>>(() =>
    readStoredConsent(),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, networkId);
    } catch {
      /* ignore */
    }
  }, [networkId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MAINNET_CONSENT_KEY, JSON.stringify(consentMap));
    } catch {
      /* ignore */
    }
  }, [consentMap]);

  const requestNetworkChange = useCallback(
    (next: KilnNetworkId) => {
      if (next === networkId) {
        return;
      }
      const profile = getNetworkProfile(next);
      // Sandbox/testnet switches are no-ceremony. Mainnet demands explicit consent
      // because the next button the user presses might spend real funds.
      if (profile.tier === 'mainnet' && !consentMap[next]) {
        setPendingMainnet(next);
        return;
      }
      setNetworkId(next);
    },
    [consentMap, networkId],
  );

  const confirmMainnetConsent = useCallback(() => {
    if (!pendingMainnet) {
      return;
    }
    setConsentMap((current) => ({ ...current, [pendingMainnet]: true }));
    setNetworkId(pendingMainnet);
    setPendingMainnet(null);
  }, [pendingMainnet]);

  const cancelMainnetConsent = useCallback(() => {
    setPendingMainnet(null);
  }, []);

  const value = useMemo<NetworkContextValue>(() => {
    const network = getNetworkProfile(networkId);
    return {
      networkId,
      network,
      pickable: listPickableNetworks(),
      pendingMainnetConsent: pendingMainnet,
      requestNetworkChange,
      confirmMainnetConsent,
      cancelMainnetConsent,
      can: (capability) => Boolean(network.capabilities[capability]),
      isTezos: network.ecosystem === 'tezos',
      isEvm: network.ecosystem === 'etherlink',
      ecosystem: network.ecosystem,
    };
  }, [networkId, pendingMainnet, requestNetworkChange, confirmMainnetConsent, cancelMainnetConsent]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useKilnNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error('useKilnNetwork must be used inside NetworkProvider');
  }
  return ctx;
}
