import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { getEnv } from './src/lib/env.js';
import { createApiApp } from './src/server-app.js';

dotenv.config();

export async function startServer() {
  const env = getEnv();
  const app = createApiApp({ env }) as express.Express;

  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: 'API route not found',
      method: req.method,
      path: req.path,
      requestId: res.locals.requestId ?? null,
    });
  });

  if (env.NODE_ENV !== 'production') {
    // Dev-only dynamic import via string specifier so esbuild / node prod
    // bundle never attempts to resolve vite at runtime. vite is a devDep.
    const viteSpecifier = 'vite';
    const viteModule = (await import(viteSpecifier)) as typeof import('vite');
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });
}

// Entry-point detection that works both when this file is loaded as
// ESM via `tsx server.ts` (dev) and when it is bundled to CJS by esbuild
// and run as `node dist/server.cjs` (prod). `import.meta` isn't
// available in CJS output, so we deliberately avoid it and just match
// on the script basename passed to the process.
const entryScript = process.argv[1] ?? '';
const entryBase = entryScript ? path.basename(entryScript) : '';
const isMainModule =
  entryBase === 'server.ts' ||
  entryBase === 'server.js' ||
  entryBase === 'server.cjs';

if (isMainModule) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
