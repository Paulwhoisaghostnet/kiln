const netlifyFunctionPrefix = '/.netlify/functions/api';

export function normalizeNetlifyApiPath(rawPath?: string): string {
  const input = rawPath?.trim() || '/';
  const withLeadingSlash = input.startsWith('/') ? input : `/${input}`;
  const withoutFunctionPrefix = withLeadingSlash.startsWith(netlifyFunctionPrefix)
    ? withLeadingSlash.slice(netlifyFunctionPrefix.length) || '/'
    : withLeadingSlash;

  if (
    withoutFunctionPrefix === '/api' ||
    withoutFunctionPrefix.startsWith('/api/')
  ) {
    return withoutFunctionPrefix;
  }

  if (withoutFunctionPrefix === '/') {
    return '/api/health';
  }

  return `/api${withoutFunctionPrefix}`;
}
