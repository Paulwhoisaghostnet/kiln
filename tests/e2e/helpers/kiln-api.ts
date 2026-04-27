import { apiToken, baseUrl, requiredHeaders } from './kiln-env';

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  json?: unknown;
  text: string;
}

export interface ApiCallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  expectJson?: boolean;
}

function normalizeUrl(pathname: string): string {
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    return pathname;
  }
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${baseUrl}${normalized}`;
}

export async function callKilnApi<T = unknown>(
  pathname: string,
  options: ApiCallOptions = {},
): Promise<ApiResponse & { data?: T }> {
  const { method = 'GET', body, headers = {}, expectJson = true } = options;
  const res = await fetch(normalizeUrl(pathname), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...requiredHeaders,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const response: ApiResponse = {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
  };

  if (expectJson) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      response.json = JSON.parse(text || 'null');
    }
  }

  return { ...response, data: response.json as T | undefined };
}

export async function expectUnauthorized(pathname: string, method: 'GET' | 'POST' = 'POST') {
  const response = await callKilnApi(pathname, {
    method,
    body: method === 'POST' ? {} : undefined,
    expectJson: false,
  });
  if (response.status !== 401 && response.status !== 403) {
    throw new Error(
      `${method} ${pathname} expected auth failure, got status ${response.status}`,
    );
  }
}

export function stripTokenForUnauthorized(pathname: string) {
  return callKilnApi(pathname, {
    method: 'GET',
    headers: apiToken
      ? {
          'x-kiln-token': 'wrong-token',
        }
      : undefined,
    expectJson: false,
  });
}
