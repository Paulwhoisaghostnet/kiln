import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { CopyKey, KilnViewMode } from '../lib/kiln-view-copy.js';
import { viewText, viewTip } from '../lib/kiln-view-copy.js';

const STORAGE_KEY = 'kilnViewMode';

type KilnViewContextValue = {
  mode: KilnViewMode;
  setMode: (m: KilnViewMode) => void;
  t: (key: CopyKey) => string;
  tip: (key: CopyKey) => string | undefined;
};

const KilnViewContext = createContext<KilnViewContextValue | null>(null);

export function KilnViewProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<KilnViewMode>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'eli5' || raw === 'builder') {
        return raw;
      }
    } catch {
      /* ignore */
    }
    return 'builder';
  });

  const setMode = useCallback((next: KilnViewMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: CopyKey) => viewText(mode, key), [mode]);
  const tip = useCallback((key: CopyKey) => viewTip(mode, key), [mode]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      t,
      tip,
    }),
    [mode, setMode, t, tip],
  );

  return <KilnViewContext.Provider value={value}>{children}</KilnViewContext.Provider>;
}

export function useKilnView(): KilnViewContextValue {
  const ctx = useContext(KilnViewContext);
  if (!ctx) {
    throw new Error('useKilnView must be used within KilnViewProvider');
  }
  return ctx;
}

const eli5HintClass =
  'cursor-help underline decoration-dotted decoration-base-content/40 underline-offset-2';

type KilnCopyAs = 'span' | 'p' | 'div';

export function KilnCopy({
  k,
  as = 'span',
  className,
  children,
}: {
  k: CopyKey;
  as?: KilnCopyAs;
  className?: string;
  children?: React.ReactNode;
}) {
  const { mode, t, tip } = useKilnView();
  const Tag = as;
  const title = mode === 'eli5' ? tip(k) : undefined;
  const showHint = Boolean(title);
  return (
    <Tag
      className={[className, showHint ? eli5HintClass : ''].filter(Boolean).join(' ')}
      title={title}
    >
      {children ?? t(k)}
    </Tag>
  );
}
