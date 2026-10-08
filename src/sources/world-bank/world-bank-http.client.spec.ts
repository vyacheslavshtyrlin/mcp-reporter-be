import { isSourceError, SOURCE_ERROR_CODE } from '../contracts/source.error.js';
import {
  type FetchLike,
  WorldBankHttpClient,
} from './world-bank-http.client.js';

const request = {
  pathSegments: ['country', 'DEU'],
  query: { format: 'json' },
} as const;

describe('WorldBankHttpClient', () => {
  it('performs a GET request and returns JSON as unknown', async () => {
    const caller = new AbortController();
    let requestedUrl: URL | undefined;
    let requestedInit: RequestInit | undefined;
    const fetch: FetchLike = async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(JSON.stringify({ page: 1 }), { status: 200 });
    };
    const client = new WorldBankHttpClient({ fetch });

    await expect(client.getJson(request, caller.signal)).resolves.toEqual({
      page: 1,
    });
    expect(requestedUrl?.toString()).toBe(
      'https://api.worldbank.org/v2/country/DEU?format=json',
    );
    expect(requestedInit).toMatchObject({
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    expect(requestedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('marks 429 and 5xx responses as retryable source failures', async () => {
    const fetch: FetchLike = async () =>
      new Response(null, { status: 503, statusText: 'Unavailable' });
    const client = new WorldBankHttpClient({ fetch });

    const promise = client.getJson(request, new AbortController().signal);

    await expect(promise).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
      retryable: true,
      context: { sourceId: 'world-bank', statusCode: 503 },
    });
  });

  it('does not mark a non-transient HTTP failure as retryable', async () => {
    const fetch: FetchLike = async () =>
      new Response(null, { status: 404, statusText: 'Not Found' });
    const client = new WorldBankHttpClient({ fetch });

    await expect(
      client.getJson(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
      retryable: false,
      context: { statusCode: 404 },
    });
  });

  it('maps malformed JSON to SOURCE_RESPONSE_INVALID', async () => {
    const fetch: FetchLike = async () =>
      new Response('not-json', { status: 200 });
    const client = new WorldBankHttpClient({ fetch });

    await expect(
      client.getJson(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      retryable: false,
    });
  });

  it('maps a network failure to a retryable SOURCE_UNAVAILABLE', async () => {
    const networkError = new Error('socket closed');
    const fetch: FetchLike = async () => {
      throw networkError;
    };
    const client = new WorldBankHttpClient({ fetch });

    try {
      await client.getJson(request, new AbortController().signal);
      expect.unreachable('Expected the client to reject');
    } catch (error: unknown) {
      expect(isSourceError(error)).toBe(true);
      expect(error).toMatchObject({
        code: SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
        retryable: true,
        cause: networkError,
      });
    }
  });

  it('maps its own timeout to SOURCE_TIMEOUT', async () => {
    const timeoutReason = new DOMException('Timed out', 'TimeoutError');
    const timeoutSignal = AbortSignal.abort(timeoutReason);
    const fetch: FetchLike = async () => {
      throw timeoutReason;
    };
    const client = new WorldBankHttpClient({
      fetch,
      timeoutMs: 25,
      createTimeoutSignal: (timeoutMs) => {
        expect(timeoutMs).toBe(25);
        return timeoutSignal;
      },
    });

    await expect(
      client.getJson(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_TIMEOUT,
      retryable: true,
      context: { sourceId: 'world-bank', timeoutMs: 25 },
      cause: timeoutReason,
    });
  });

  it('preserves caller cancellation instead of reporting a timeout', async () => {
    const cancellation = new DOMException('User cancelled', 'AbortError');
    const caller = new AbortController();
    caller.abort(cancellation);
    const fetch: FetchLike = async () => {
      throw cancellation;
    };
    const client = new WorldBankHttpClient({ fetch });

    await expect(client.getJson(request, caller.signal)).rejects.toBe(
      cancellation,
    );
  });

  it.each([0, -1, 1.5])('rejects an invalid timeout: %s', (timeoutMs) => {
    expect(() => new WorldBankHttpClient({ timeoutMs })).toThrow(RangeError);
  });
});
