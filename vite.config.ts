import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react/') || id.includes('/react-dom/')) {
              return 'vendor-react';
            }
            if (
              id.includes('@taquito/') ||
              id.includes('@airgap/') ||
              id.includes('@walletconnect/') ||
              id.includes('@stablelib/') ||
              id.includes('@noble/') ||
              id.includes('@scure/')
            ) {
              return 'vendor-tezos';
            }
            if (id.includes('/viem/') || id.includes('/ox/')) {
              return 'vendor-evm';
            }
            if (
              id.includes('/lucide-react/') ||
              id.includes('/motion/') ||
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/')
            ) {
              return 'vendor-ui';
            }
            if (
              id.includes('/buffer/') ||
              id.includes('/process/') ||
              id.includes('/stream-browserify/') ||
              id.includes('/events/') ||
              id.includes('/util/')
            ) {
              return 'vendor-polyfills';
            }
          },
        },
      },
    },
  };
});
