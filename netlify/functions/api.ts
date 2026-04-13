import type { Handler, HandlerResponse } from '@netlify/functions';
import serverless from 'serverless-http';
import { getEnv } from '../../src/lib/env.js';
import { normalizeNetlifyApiPath } from '../../src/lib/netlify-api-path.js';
import { createApiApp } from '../../src/server-app.js';

const app = createApiApp({ env: getEnv(process.env) });
const expressHandler = serverless(app) as (
  event: Record<string, unknown>,
  context: Record<string, unknown>,
) => Promise<unknown>;

export const handler: Handler = async (event, context) => {
  const normalizedPath = normalizeNetlifyApiPath(event.path);

  const normalizedEvent = {
    ...event,
    path: normalizedPath,
  };

  const response = await expressHandler(
    normalizedEvent,
    context as unknown as Record<string, unknown>,
  );

  if (!response || typeof response !== 'object') {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected API handler response' }),
    };
  }

  return response as HandlerResponse;
};
