import type { CallToolResult } from '@modelcontextprotocol/server';

import { ExecutionError } from '../execution/execution.error.js';
import { isSourceError } from '../sources/contracts/index.js';

export type McpToolEnvelope<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: McpSafeError };

export interface McpSafeError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export async function executeMcpTool<T>(
  action: () => Promise<T>,
  summarize: (value: T) => string,
  signal: AbortSignal,
): Promise<CallToolResult> {
  try {
    const value = await action();
    const envelope: McpToolEnvelope<T> = { ok: true, data: value };
    return {
      content: [{ type: 'text', text: summarize(value) }],
      structuredContent: { ...envelope },
    };
  } catch (error: unknown) {
    const safeError = toSafeError(error, signal);
    const envelope: McpToolEnvelope<never> = { ok: false, error: safeError };
    return {
      content: [
        {
          type: 'text',
          text: `${safeError.code}: ${safeError.message}`,
        },
      ],
      structuredContent: { ...envelope },
      isError: true,
    };
  }
}

function toSafeError(error: unknown, signal: AbortSignal): McpSafeError {
  if (signal.aborted) {
    return {
      code: 'REPORT_REQUEST_ABORTED',
      message: 'Request was aborted by the client',
      retryable: false,
    };
  }

  if (isSourceError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof ExecutionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'The operation could not be completed',
    retryable: false,
  };
}
