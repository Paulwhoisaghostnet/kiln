import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { RequestHandler } from 'express';

export interface ActivityLogEvent {
  timestamp: string;
  requestId?: string;
  event: string;
  [key: string]: unknown;
}

export interface ActivityLogger {
  filePath: string;
  log(event: ActivityLogEvent): void;
}

function safeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => safeValue(item));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(record)) {
      out[key] = safeValue(inner);
    }
    return out;
  }
  return String(value);
}

export function createActivityLogger(customPath?: string): ActivityLogger {
  const filePath =
    customPath?.trim() || resolve(process.cwd(), 'logs', 'kiln-activity.log');

  const log = (event: ActivityLogEvent) => {
    const payload = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      event: event.event || 'unknown',
      data: safeValue(event),
    });

    void fs
      .mkdir(dirname(filePath), { recursive: true })
      .then(() => fs.appendFile(filePath, `${payload}\n`, 'utf8'))
      .catch((error) => {
        console.error('Failed to persist activity log:', error);
      });
  };

  return { filePath, log };
}

export function createRequestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming?.trim() || randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

export function createRequestLoggingMiddleware(
  logger: ActivityLogger,
): RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();
    const requestId = (res.locals.requestId as string | undefined) ?? randomUUID();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      logger.log({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'http_request',
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip,
        userAgent: req.header('user-agent') || null,
      });
    });

    next();
  };
}

export async function readRecentActivityLog(
  filePath: string,
  limit = 100,
): Promise<string[]> {
  const clamped = Math.max(1, Math.min(limit, 500));
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-clamped);
}
