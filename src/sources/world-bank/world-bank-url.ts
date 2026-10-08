export const WORLD_BANK_ORIGIN = 'https://api.worldbank.org';

export type WorldBankQueryValue = string | number | boolean | undefined;

export interface WorldBankHttpRequest {
  readonly pathSegments: readonly string[];
  readonly query?: Readonly<Record<string, WorldBankQueryValue>>;
}

export function buildWorldBankUrl(request: WorldBankHttpRequest): URL {
  if (request.pathSegments.length === 0) {
    throw new TypeError('World Bank request path must not be empty');
  }

  const encodedSegments = request.pathSegments.map((segment) => {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      throw new TypeError(
        'World Bank request contains an invalid path segment',
      );
    }

    return encodeURIComponent(segment);
  });

  const url = new URL(WORLD_BANK_ORIGIN);
  url.pathname = `/v2/${encodedSegments.join('/')}`;

  const queryEntries = Object.entries(request.query ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );

  for (const [key, value] of queryEntries) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}
