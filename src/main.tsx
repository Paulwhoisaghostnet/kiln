import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { KilnViewProvider } from './context/KilnViewProvider.tsx';
import { NetworkProvider } from './context/NetworkProvider.tsx';
import './index.css';

const browserGlobal = globalThis as unknown as {
  global?: unknown;
  Buffer?: typeof Buffer;
  process?: {
    env?: Record<string, string>;
    browser?: boolean;
    version?: string;
    versions?: { node?: string };
    nextTick?: (cb: (...args: unknown[]) => void, ...args: unknown[]) => void;
  };
};

if (!browserGlobal.global) {
  browserGlobal.global = browserGlobal;
}
if (!browserGlobal.Buffer) {
  browserGlobal.Buffer = Buffer;
}
if (!browserGlobal.process) {
  browserGlobal.process = {};
}
if (!browserGlobal.process.env) {
  browserGlobal.process.env = {};
}
if (!browserGlobal.process.version) {
  browserGlobal.process.version = 'v20.0.0';
}
if (!browserGlobal.process.versions) {
  browserGlobal.process.versions = { node: '20.0.0' };
}
if (typeof browserGlobal.process.browser === 'undefined') {
  browserGlobal.process.browser = true;
}
if (!browserGlobal.process.nextTick) {
  browserGlobal.process.nextTick = (cb: (...args: unknown[]) => void, ...args: unknown[]) =>
    queueMicrotask(() => cb(...args));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KilnViewProvider>
      <NetworkProvider>
        <App />
      </NetworkProvider>
    </KilnViewProvider>
  </StrictMode>,
);
