import { useMemo } from 'react';
import { Globe, ShieldAlert, Zap, AlertTriangle } from 'lucide-react';
import { useKilnNetwork } from '../context/NetworkProvider';
import type { KilnNetworkId, KilnNetworkProfile } from '../lib/networks';

const tierIcon: Record<KilnNetworkProfile['tier'], React.ReactNode> = {
  sandbox: <Zap className="w-4 h-4" />,
  testnet: <Globe className="w-4 h-4" />,
  mainnet: <ShieldAlert className="w-4 h-4" />,
};

const accentBadge: Record<KilnNetworkProfile['accent'], string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  secondary: 'badge-secondary',
  info: 'badge-info',
};

const accentPill: Record<KilnNetworkProfile['accent'], string> = {
  success: 'bg-success/10 border-success/40 text-success',
  warning: 'bg-warning/10 border-warning/40 text-warning',
  error: 'bg-error/10 border-error/50 text-error',
  secondary: 'bg-secondary/10 border-secondary/40 text-secondary',
  info: 'bg-info/10 border-info/40 text-info',
};

export function NetworkStatusPill({
  health,
}: {
  health: 'checking' | 'online' | 'offline';
}) {
  const { network } = useKilnNetwork();
  const accent = accentPill[network.accent];
  const healthColor =
    health === 'online'
      ? 'bg-success'
      : health === 'checking'
        ? 'bg-warning animate-pulse'
        : 'bg-error';
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${accent}`}
      title={`${network.label} · ${network.ecosystem} · ${network.tier}`}
    >
      <span className={`w-2 h-2 rounded-full ${healthColor}`} />
      <span>{network.label}</span>
      <span className="opacity-60">·</span>
      <span className="uppercase tracking-wide opacity-80">{network.tier}</span>
    </div>
  );
}

export function NetworkSwitcher() {
  const { networkId, network, pickable, requestNetworkChange } = useKilnNetwork();
  const grouped = useMemo(() => {
    const byTier: Record<KilnNetworkProfile['tier'], KilnNetworkProfile[]> = {
      sandbox: [],
      testnet: [],
      mainnet: [],
    };
    for (const profile of pickable) {
      byTier[profile.tier].push(profile);
    }
    return byTier;
  }, [pickable]);

  const renderRow = (profile: KilnNetworkProfile) => {
    const selected = profile.id === networkId;
    const badge = accentBadge[profile.accent];
    return (
      <li key={profile.id}>
        <button
          type="button"
          className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-colors text-left ${
            selected
              ? `${accentPill[profile.accent]} border-transparent ring-1 ring-current`
              : 'border-base-300/60 hover:border-primary/40 hover:bg-base-200/40'
          }`}
          onClick={() => requestNetworkChange(profile.id as KilnNetworkId)}
          title={profile.blurb}
        >
          <div
            className={`p-2 rounded-lg ${selected ? 'bg-base-100/30' : 'bg-base-200 text-base-content/60'}`}
          >
            {tierIcon[profile.tier]}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{profile.label}</span>
              <span className={`badge badge-xs ${badge}`}>{profile.tier}</span>
              <span className="badge badge-xs badge-outline capitalize">
                {profile.ecosystem}
              </span>
            </div>
            <p className="text-xs text-base-content/70 leading-snug">{profile.blurb}</p>
          </div>
        </button>
      </li>
    );
  };

  return (
    <div className="dropdown dropdown-end">
      <label
        tabIndex={0}
        className={`btn btn-sm gap-2 normal-case ${
          network.tier === 'mainnet' ? 'btn-error btn-outline' : 'btn-outline'
        }`}
      >
        {tierIcon[network.tier]}
        <span>{network.label}</span>
        <svg
          className="w-3 h-3 opacity-60"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </label>
      <div
        tabIndex={0}
        className="dropdown-content mt-2 card card-compact bg-base-100 border border-base-300 shadow-xl w-80 z-50"
      >
        <div className="card-body !p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Shadowbox is the preflight sandbox; these are live network targets.</span>
          </div>
          {grouped.sandbox.length > 0 ? (
            <section className="space-y-1">
              <div className="text-[0.65rem] uppercase tracking-widest text-base-content/50 px-1">
                Sandbox
              </div>
              <ul className="space-y-1">{grouped.sandbox.map(renderRow)}</ul>
            </section>
          ) : null}
          {grouped.testnet.length > 0 ? (
            <section className="space-y-1">
              <div className="text-[0.65rem] uppercase tracking-widest text-base-content/50 px-1">
                Testnets
              </div>
              <ul className="space-y-1">{grouped.testnet.map(renderRow)}</ul>
            </section>
          ) : null}
          {grouped.mainnet.length > 0 ? (
            <section className="space-y-1">
              <div className="text-[0.65rem] uppercase tracking-widest text-error/80 px-1">
                Mainnets (real funds)
              </div>
              <ul className="space-y-1">{grouped.mainnet.map(renderRow)}</ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MainnetConsentModal() {
  const {
    pendingMainnetConsent,
    confirmMainnetConsent,
    cancelMainnetConsent,
    pickable,
  } = useKilnNetwork();

  if (!pendingMainnetConsent) {
    return null;
  }

  const profile = pickable.find((p) => p.id === pendingMainnetConsent);
  if (!profile) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mainnet-consent-title"
    >
      <div className="max-w-lg w-full bg-base-100 rounded-2xl shadow-2xl border border-error/50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-error/10 text-error">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 id="mainnet-consent-title" className="text-lg font-bold">
              Switch to {profile.label}?
            </h2>
            <p className="text-xs text-base-content/60">
              {profile.ecosystem === 'tezos' ? 'Tezos protocol' : 'Tezos EVM rollup'} ·{' '}
              mainnet
            </p>
          </div>
        </div>

        <div className="text-sm space-y-3 leading-relaxed">
          <p>
            You're about to aim Kiln at <strong>{profile.label}</strong>. Everything you
            deploy, execute, or sign will use{' '}
            <strong>real {profile.nativeSymbol.toUpperCase()}</strong> and will be
            permanently recorded on-chain.
          </p>
          <ul className="space-y-1 text-xs text-base-content/80 list-disc ml-5">
            <li>Puppet wallets (Bert/Ernie) are disabled on mainnet.</li>
            <li>Your browser wallet will be asked to switch to the correct chain id.</li>
            <li>
              Pre-deploy validation, audit, and simulation still run — clearance is
              required before every deploy.
            </li>
            <li>Block explorers will show your address publicly.</li>
          </ul>
          <p className="text-xs text-base-content/60">
            RPC: <span className="font-mono">{profile.defaultRpcUrl}</span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={cancelMainnetConsent}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-error btn-sm"
            onClick={confirmMainnetConsent}
          >
            I understand — switch to {profile.label}
          </button>
        </div>
      </div>
    </div>
  );
}
