import { setTimeout as delay } from 'node:timers/promises';

import { isSourceError } from '../contracts/source.error.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 1_000;

export type RetrySleep = (
  delayMs: number,
  signal: AbortSignal,
) => Promise<void>;

export interface WorldBankRetryPolicyOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly sleep?: RetrySleep;
}

export class WorldBankRetryPolicy {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: RetrySleep;

  constructor(options: WorldBankRetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.sleep = options.sleep ?? defaultSleep;

    assertPositiveInteger(this.maxAttempts, 'maxAttempts');
    assertPositiveInteger(this.baseDelayMs, 'baseDelayMs');
    assertPositiveInteger(this.maxDelayMs, 'maxDelayMs');

    if (this.baseDelayMs > this.maxDelayMs) {
      throw new RangeError('baseDelayMs must not exceed maxDelayMs');
    }
  }

  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      signal.throwIfAborted();

      try {
        return await operation(attempt);
      } catch (error: unknown) {
        if (signal.aborted) {
          signal.throwIfAborted();
        }

        const mayRetry =
          isSourceError(error) && error.retryable && attempt < this.maxAttempts;

        if (!mayRetry) {
          throw error;
        }

        const delayMs = Math.min(
          this.baseDelayMs * 2 ** (attempt - 1),
          this.maxDelayMs,
        );

        try {
          await this.sleep(delayMs, signal);
          signal.throwIfAborted();
        } catch (sleepError: unknown) {
          if (signal.aborted) {
            signal.throwIfAborted();
          }

          throw sleepError;
        }
      }
    }

    throw new Error('World Bank retry loop ended unexpectedly');
  }
}

async function defaultSleep(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  await delay(delayMs, undefined, { signal });
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}
