import { promises as fs } from 'node:fs';
import { Router } from 'express';
import { exportBundlePayloadSchema } from '../../lib/api-schemas.js';
import { resolveExportZipPath } from '../../lib/bundle-export.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage, validationErrorMessage } from '../http.js';

export function createExportRouter(services: ApiAppServices): Router {
  const router = Router();

  router.post(
    '/api/kiln/export/bundle',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = exportBundlePayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const result = await services.exportBundle({
          ...payload.data,
          deployment: {
            networkId:
              payload.data.deployment?.networkId ?? services.runtimeNetwork.id,
            rpcUrl:
              payload.data.deployment?.rpcUrl ?? services.runtimeNetwork.rpcUrl,
            chainId:
              payload.data.deployment?.chainId ??
              services.runtimeNetwork.chainId,
            contractAddress: payload.data.deployment?.contractAddress,
            originatedAt: payload.data.deployment?.originatedAt,
          },
        });

        services.activityLogger.log({
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId as string | undefined,
          event: 'bundle_export',
          bundleId: result.bundleId,
          zipFileName: result.zipFileName,
        });

        res.json({
          success: true,
          ...result,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.get(
    '/api/kiln/export/download/:fileName',
    services.requireApiToken,
    async (req, res) => {
      const fileName = req.params.fileName;
      if (!fileName) {
        res.status(400).json({ error: 'fileName is required.' });
        return;
      }

      try {
        const zipPath = resolveExportZipPath(fileName);
        await fs.access(zipPath);
        res.download(zipPath, fileName);
      } catch (error) {
        const message = asMessage(error);
        const status = message.includes('Invalid bundle file name') ? 400 : 404;
        res.status(status).json({ error: message });
      }
    },
  );

  return router;
}
