import type { SourceErrorCode } from '../sources/contracts/index.js';

export const EXECUTION_ERROR_CODE = {
  REPORT_RUN_NOT_FOUND: 'REPORT_RUN_NOT_FOUND',
  INVALID_REPORT_RUN_TRANSITION: 'INVALID_REPORT_RUN_TRANSITION',
  INVALID_REPORT_RUN_PAGE: 'INVALID_REPORT_RUN_PAGE',
  REPORT_RUN_CAPACITY_EXCEEDED: 'REPORT_RUN_CAPACITY_EXCEEDED',
  REPORT_DEADLINE_EXCEEDED: 'REPORT_DEADLINE_EXCEEDED',
  REPORT_REQUEST_ABORTED: 'REPORT_REQUEST_ABORTED',
  REPORT_EXECUTION_FAILED: 'REPORT_EXECUTION_FAILED',
} as const;

export type ExecutionErrorCode =
  (typeof EXECUTION_ERROR_CODE)[keyof typeof EXECUTION_ERROR_CODE];

export type ReportRunErrorCode = ExecutionErrorCode | SourceErrorCode;

interface ExecutionErrorOptions extends ErrorOptions {
  readonly retryable?: boolean;
}

export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly retryable: boolean;

  constructor(
    code: ExecutionErrorCode,
    message: string,
    options: ExecutionErrorOptions = {},
  ) {
    super(message, options);
    this.name = 'ExecutionError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}
