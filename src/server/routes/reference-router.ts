import { Router } from 'express';
import {
  guidedContractPayloadSchema,
  guidedElementsQuerySchema,
} from '../../lib/api-schemas.js';
import { buildGuidedContractDraft } from '../../lib/guided-contracts.js';
import { listReferenceContracts } from '../../lib/reference-contracts.js';
import { listGuidedElementsFromReferences } from '../../lib/reference-guided-elements.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage, validationErrorMessage } from '../http.js';

export function createReferenceRouter(services: ApiAppServices): Router {
  const router = Router();

  router.get(
    '/api/kiln/reference/contracts',
    services.requireApiToken,
    async (_req, res) => {
      try {
        const contracts = await listReferenceContracts();
        res.json({
          success: true,
          count: contracts.length,
          contracts,
        });
      } catch (error) {
        res.status(500).json({
          error: `Unable to load reference contracts: ${asMessage(error)}`,
        });
      }
    },
  );

  router.post(
    '/api/kiln/contracts/guided/elements',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = guidedElementsQuerySchema.safeParse(req.body ?? {});
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const elements = await listGuidedElementsFromReferences(
          payload.data.contractType,
        );
        res.json({
          success: true,
          contractType: payload.data.contractType,
          count: elements.length,
          elements,
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  router.post(
    '/api/kiln/contracts/guided/create',
    services.requireApiToken,
    services.mutationLimiter,
    async (req, res) => {
      const payload = guidedContractPayloadSchema.safeParse(req.body);
      if (!payload.success) {
        res.status(400).json({
          error: validationErrorMessage(payload.error),
        });
        return;
      }

      try {
        const referenceElements = await listGuidedElementsFromReferences(
          payload.data.contractType,
        );
        const selectedElementSet = new Set(payload.data.selectedElements);
        const selectedReferenceElements = referenceElements.filter((element) =>
          selectedElementSet.has(element.id),
        );
        const selectedSourceContracts = Array.from(
          new Map(
            selectedReferenceElements
              .flatMap((element) => element.evidenceContracts)
              .map((contract) => [contract.slug, contract]),
          ).values(),
        );
        const draft = buildGuidedContractDraft(payload.data);
        res.json({
          success: true,
          ...draft,
          referenceInsights: {
            availableElements: referenceElements,
            selectedElements: selectedReferenceElements,
            sourceContracts: selectedSourceContracts,
          },
        });
      } catch (error) {
        res.status(500).json({ error: asMessage(error) });
      }
    },
  );

  return router;
}
