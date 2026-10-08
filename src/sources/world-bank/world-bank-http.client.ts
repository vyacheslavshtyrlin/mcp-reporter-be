import {
  isSourceError,
  SOURCE_ERROR_CODE,
  SourceError,
} from '../contracts/source.error.js';
import {
  buildWorldBankUrl,
  type WorldBankHttpRequest,
} from './world-bank-url.js';

const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export type TimeoutSignalFactory = (timeoutMs: number) => AbortSignal;

export interface WorldBankHttpClientOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly createTimeoutSignal?: TimeoutSignalFactory;
}

export class WorldBankHttpClient {
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly createTimeoutSignal: TimeoutSignalFactory;

  constructor(options: WorldBankHttpClientOptions = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('World Bank timeout must be a positive integer');
    }

    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.createTimeoutSignal =
      options.createTimeoutSignal ?? AbortSignal.timeout;
  }

  async getJson(
    request: WorldBankHttpRequest,
    callerSignal: AbortSignal,
  ): Promise<unknown> {
    const url = buildWorldBankUrl(request);
    const timeoutSignal = this.createTimeoutSignal(this.timeoutMs);
    const signal = AbortSignal.any([callerSignal, timeoutSignal]);

    try {
      const response = await this.fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
        redirect: 'error',
        signal,
      });

      if (!response.ok) {
        throw new SourceError(
          SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
          'World Bank returned an unsuccessful HTTP status',
          {
            retryable: response.status === 429 || response.status >= 500,
            context: {
              sourceId: 'world-bank',
              statusCode: response.status,
            },
          },
        );
      }

      try {
        return (await response.json()) as unknown;
      } catch (error: unknown) {
        throw new SourceError(
          SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
          'World Bank returned invalid JSON',
          {
            cause: error,
            context: { sourceId: 'world-bank' },
          },
        );
      }
    } catch (error: unknown) {
      if (isSourceError(error)) {
        throw error;
      }

      if (callerSignal.aborted) {
        throw (
          callerSignal.reason ??
          new DOMException('World Bank request was cancelled', 'AbortError')
        );
      }

      if (timeoutSignal.aborted) {
        throw new SourceError(
          SOURCE_ERROR_CODE.SOURCE_TIMEOUT,
          'World Bank request timed out',
          {
            cause: error,
            retryable: true,
            context: {
              sourceId: 'world-bank',
              timeoutMs: this.timeoutMs,
            },
          },
        );
      }

      throw new SourceError(
        SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
        'World Bank request failed',
        {
          cause: error,
          retryable: true,
          context: { sourceId: 'world-bank' },
        },
      );
    }
  }
}
