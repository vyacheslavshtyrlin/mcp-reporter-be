import { SOURCE_ERROR_CODE, SourceError } from '../contracts/source.error.js';
import {
  WorldBankRetryPolicy,
  type WorldBankRetryPolicyOptions,
} from './world-bank-retry.policy.js';

function retryableFailure(): SourceError {
  return new SourceError(
    SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
    'Temporary World Bank failure',
    { retryable: true },
  );
}

describe('WorldBankRetryPolicy', () => {
  it('retries transient failures with capped exponential backoff', async () => {
    const delays: number[] = [];
    let attempts = 0;
    const policy = new WorldBankRetryPolicy({
      maxAttempts: 4,
      baseDelayMs: 10,
      maxDelayMs: 15,
      sleep: (delayMs) => {
        delays.push(delayMs);
        return Promise.resolve();
      },
    });

    const result = await policy.execute(async () => {
      attempts += 1;

      if (attempts < 4) {
        throw retryableFailure();
      }

      return 'ok';
    }, new AbortController().signal);

    expect(result).toBe('ok');
    expect(attempts).toBe(4);
    expect(delays).toEqual([10, 15, 15]);
  });

  it('does not retry a non-retryable source error', async () => {
    const failure = new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'Invalid response',
    );
    const sleep = vi.fn<NonNullable<WorldBankRetryPolicyOptions['sleep']>>();
    const operation = vi.fn(async () => {
      throw failure;
    });
    const policy = new WorldBankRetryPolicy({ sleep });

    await expect(
      policy.execute(operation, new AbortController().signal),
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('returns the last transient error after the attempt limit', async () => {
    const failures = [retryableFailure(), retryableFailure()];
    const policy = new WorldBankRetryPolicy({
      maxAttempts: 2,
      sleep: () => Promise.resolve(),
    });

    await expect(
      policy.execute(async (attempt) => {
        throw failures[attempt - 1];
      }, new AbortController().signal),
    ).rejects.toBe(failures[1]);
  });

  it('preserves caller cancellation during backoff', async () => {
    const controller = new AbortController();
    const cancellation = new Error('report cancelled');
    const policy = new WorldBankRetryPolicy({
      sleep: () => {
        controller.abort(cancellation);
        return Promise.resolve();
      },
    });

    await expect(
      policy.execute(async () => {
        throw retryableFailure();
      }, controller.signal),
    ).rejects.toBe(cancellation);
  });

  it.each([
    { options: { maxAttempts: 0 }, message: 'maxAttempts' },
    { options: { baseDelayMs: 1.5 }, message: 'baseDelayMs' },
    { options: { maxDelayMs: -1 }, message: 'maxDelayMs' },
    {
      options: { baseDelayMs: 20, maxDelayMs: 10 },
      message: 'baseDelayMs',
    },
  ])('rejects invalid options containing $message', ({ options, message }) => {
    expect(() => new WorldBankRetryPolicy(options)).toThrow(message);
  });
});
