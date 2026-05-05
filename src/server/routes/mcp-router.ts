import { Router, type Request } from 'express';
import type { KilnUser, McpTokenRecord } from '../../lib/kiln-users.js';
import type { ApiAppServices } from '../app-services.js';
import { asMessage } from '../http.js';
import { createMcpTools, type McpToolContext } from '../mcp-tools.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  const headerToken = req.header('x-kiln-mcp-token');
  return headerToken?.trim() || null;
}

function jsonRpcError(
  id: JsonRpcResponse['id'],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.jsonrpc === '2.0' && typeof record.method === 'string';
}

async function handleJsonRpcRequest(
  request: JsonRpcRequest,
  context: McpToolContext,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  const isNotification = !Object.prototype.hasOwnProperty.call(request, 'id');

  if (!request.method) {
    return jsonRpcError(id, -32600, 'Invalid Request');
  }

  if (request.method === 'notifications/initialized') {
    return isNotification ? null : { jsonrpc: '2.0', id, result: {} };
  }

  if (request.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'kiln-wtfgameshow-mcp',
          version: '1.0.0',
        },
        instructions:
          'Use Kiln MCP tools to inspect networks, compile/audit/simulate contracts, run Tezos workflows, prepare Etherlink deploys, and export handoff bundles. MCP activity is attributed to the wallet that generated the token.',
      },
    };
  }

  const tools = createMcpTools(context.services);
  if (request.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
    };
  }

  if (request.method === 'tools/call') {
    const params = request.params as
      | { name?: unknown; arguments?: unknown }
      | undefined;
    const toolName = typeof params?.name === 'string' ? params.name : '';
    const tool = tools.find((candidate) => candidate.name === toolName);
    if (!tool) {
      return jsonRpcError(id, -32602, `Unknown tool: ${toolName || '(missing)'}`);
    }

    context.services.activityLogger.log({
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      event: 'mcp_tool_call',
      userId: context.user.id,
      walletKind: context.user.walletKind,
      walletAddress: context.user.walletAddress,
      toolName,
    });

    try {
      const result = await tool.handler(params?.arguments ?? {}, context);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        },
      };
    } catch (error) {
      const message = asMessage(error);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: message }],
        },
      };
    }
  }

  return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
}

export function createMcpRouter(services: ApiAppServices): Router {
  const router = Router();

  router.post('/mcp', async (req, res) => {
    const rawToken = bearerToken(req);
    if (!rawToken) {
      res.status(401).json({ error: 'MCP bearer token required.' });
      return;
    }

    const verified = await services.userStore.verifyMcpToken(rawToken);
    if (!verified) {
      res.status(401).json({ error: 'MCP token is invalid, expired, or not approved.' });
      return;
    }

    const user: KilnUser = verified.user;
    const token: McpTokenRecord = verified.token;
    const requestId = res.locals.requestId as string | undefined;

    services.activityLogger.log({
      timestamp: new Date().toISOString(),
      requestId,
      event: 'mcp_request',
      userId: user.id,
      walletKind: user.walletKind,
      walletAddress: user.walletAddress,
      tokenId: token.id,
      method: Array.isArray(req.body)
        ? 'batch'
        : typeof req.body?.method === 'string'
          ? req.body.method
          : 'unknown',
      ip: req.ip,
      userAgent: req.header('user-agent') || null,
    });

    const context: McpToolContext = {
      services,
      user,
      requestId,
      remoteIp: req.ip,
    };

    if (Array.isArray(req.body)) {
      const responses: JsonRpcResponse[] = [];
      for (const item of req.body) {
        if (!isJsonRpcRequest(item)) {
          responses.push(jsonRpcError(null, -32600, 'Invalid Request'));
          continue;
        }
        const response = await handleJsonRpcRequest(item, context);
        if (response) {
          responses.push(response);
        }
      }
      if (responses.length === 0) {
        res.status(202).end();
        return;
      }
      res.json(responses);
      return;
    }

    if (!isJsonRpcRequest(req.body)) {
      res.status(400).json(jsonRpcError(null, -32600, 'Invalid Request'));
      return;
    }

    const response = await handleJsonRpcRequest(req.body, context);
    if (!response) {
      res.status(202).end();
      return;
    }
    res.json(response);
  });

  router.get('/mcp', (_req, res) => {
    res.json({
      name: 'kiln-wtfgameshow-mcp',
      transport: 'streamable-http',
      endpoint: '/mcp',
      auth: 'Bearer kiln_mcp_* token generated from Kiln Settings',
      protocolVersion: '2025-06-18',
    });
  });

  return router;
}
