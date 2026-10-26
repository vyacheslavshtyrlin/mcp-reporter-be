import {
  ExecutionError,
  EXECUTION_ERROR_CODE,
} from '../execution/execution.error.js';
import { SOURCE_ERROR_CODE, SourceError } from '../sources/contracts/index.js';
import { executeMcpTool } from './mcp-tool-result.js';

describe('executeMcpTool', () => {
  const signal = new AbortController().signal;

  it('returns machine-readable data and a short human summary', async () => {
    await expect(
      executeMcpTool(
        async () => ({ count: 2 }),
        ({ count }) => `${count} items`,
        signal,
      ),
    ).resolves.toEqual({
      content: [{ type: 'text', text: '2 items' }],
      structuredContent: { ok: true, data: { count: 2 } },
    });
  });

  it('maps known domain errors without exposing their cause or context', async () => {
    const error = new SourceError(
      SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
      'Source is temporarily unavailable',
      {
        retryable: true,
        cause: new Error('secret upstream payload'),
        context: { sourceId: 'fixture' },
      },
    );

    const result = await executeMcpTool(
      async () => Promise.reject(error),
      () => 'unused',
      signal,
    );

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
          message: 'Source is temporarily unavailable',
          retryable: true,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret upstream payload');
    expect(JSON.stringify(result)).not.toContain('sourceId');
  });

  it('uses a stable safe response for unexpected errors', async () => {
    const result = await executeMcpTool(
      async () => Promise.reject(new Error('database password leaked')),
      () => 'unused',
      signal,
    );

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The operation could not be completed',
          retryable: false,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('database password leaked');
  });

  it('maps execution errors and caller cancellation separately', async () => {
    const executionResult = await executeMcpTool(
      async () =>
        Promise.reject(
          new ExecutionError(
            EXECUTION_ERROR_CODE.REPORT_RUN_NOT_FOUND,
            'Report run was not found',
          ),
        ),
      () => 'unused',
      signal,
    );
    const controller = new AbortController();
    controller.abort();
    const abortedResult = await executeMcpTool(
      async () => Promise.reject(new Error('adapter abort details')),
      () => 'unused',
      controller.signal,
    );

    expect(executionResult.structuredContent).toEqual({
      ok: false,
      error: {
        code: EXECUTION_ERROR_CODE.REPORT_RUN_NOT_FOUND,
        message: 'Report run was not found',
        retryable: false,
      },
    });
    expect(abortedResult.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'REPORT_REQUEST_ABORTED',
        message: 'Request was aborted by the client',
        retryable: false,
      },
    });
  });

  it('preserves retryability for a temporary execution error', async () => {
    const result = await executeMcpTool(
      async () =>
        Promise.reject(
          new ExecutionError(
            EXECUTION_ERROR_CODE.REPORT_RUN_CAPACITY_EXCEEDED,
            'Report run capacity is temporarily exhausted',
            { retryable: true },
          ),
        ),
      () => 'unused',
      signal,
    );

    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: EXECUTION_ERROR_CODE.REPORT_RUN_CAPACITY_EXCEEDED,
        message: 'Report run capacity is temporarily exhausted',
        retryable: true,
      },
    });
  });
});
