import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import {
  createRequestIdMiddleware,
  createRequestLoggingMiddleware,
} from '../lib/activity-logger.js';
import { parseCorsOrigins } from '../lib/env.js';
import type { ApiAppServices } from './app-services.js';

function isWildcardOriginPattern(pattern: string): boolean {
  return /^https?:\/\/\*\./i.test(pattern);
}

function matchesWildcardOrigin(origin: string, pattern: string): boolean {
  const match = pattern.match(/^(https?):\/\/\*\.(.+)$/i);
  if (!match) {
    return false;
  }

  const protocol = `${match[1]}:`;
  const hostSuffix = match[2]?.toLowerCase();
  if (!hostSuffix) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.toLowerCase();
    return (
      parsedOrigin.protocol === protocol &&
      hostname.endsWith(`.${hostSuffix}`)
    );
  } catch {
    return false;
  }
}

function isAllowedCorsOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true;
    }

    if (isWildcardOriginPattern(allowedOrigin)) {
      return matchesWildcardOrigin(origin, allowedOrigin);
    }

    return false;
  });
}

export function configureApiApp(
  app: Express,
  services: ApiAppServices,
): void {
  const corsOrigins = parseCorsOrigins(services.env.CORS_ORIGINS);

  app.disable('x-powered-by');
  app.use(createRequestIdMiddleware());
  app.use(createRequestLoggingMiddleware(services.activityLogger));
  app.use(
    helmet({
      contentSecurityPolicy:
        services.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginResourcePolicy:
        services.env.NODE_ENV === 'production'
          ? { policy: 'same-site' }
          : false,
    }),
  );

  if (corsOrigins.length === 0) {
    if (services.env.NODE_ENV !== 'production') {
      app.use(cors());
    }
  } else {
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin || isAllowedCorsOrigin(origin, corsOrigins)) {
            callback(null, true);
            return;
          }
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
        },
        credentials: true,
      }),
    );
  }

  app.use(express.json({ limit: services.env.API_JSON_LIMIT }));
}
