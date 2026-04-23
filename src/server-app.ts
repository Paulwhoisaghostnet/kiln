import express from 'express';
import {
  createApiAppServices,
  type ApiAppOptions,
} from './server/app-services.js';
import { configureApiApp } from './server/app-middleware.js';
import { createEvmRouter } from './server/routes/evm-router.js';
import { createExportRouter } from './server/routes/export-router.js';
import { createReferenceRouter } from './server/routes/reference-router.js';
import { createRuntimeRouter } from './server/routes/runtime-router.js';
import { createSystemRouter } from './server/routes/system-router.js';
import { createWorkflowRouter } from './server/routes/workflow-router.js';

export function createApiApp(options: ApiAppOptions = {}) {
  const services = createApiAppServices(options);
  const app = express();
  configureApiApp(app, services);
  app.use(createSystemRouter(services));
  app.use(createReferenceRouter(services));
  app.use(createWorkflowRouter(services));
  app.use(createRuntimeRouter(services));
  app.use(createEvmRouter(services));
  app.use(createExportRouter(services));

  return app;
}
