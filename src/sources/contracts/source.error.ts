export const SOURCE_ERROR_CODE = {
  INVALID_REPORT_DEFINITION: 'INVALID_REPORT_DEFINITION',
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  DATASET_NOT_FOUND: 'DATASET_NOT_FOUND',
  UNKNOWN_DIMENSION_VALUE: 'UNKNOWN_DIMENSION_VALUE',
  UNKNOWN_MEASURE: 'UNKNOWN_MEASURE',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  SCHEMA_VERSION_MISMATCH: 'SCHEMA_VERSION_MISMATCH',
  SOURCE_TIMEOUT: 'SOURCE_TIMEOUT',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  SOURCE_RESPONSE_INVALID: 'SOURCE_RESPONSE_INVALID',
  REPORT_LIMIT_EXCEEDED: 'REPORT_LIMIT_EXCEEDED',
} as const;

export type SourceErrorCode =
  (typeof SOURCE_ERROR_CODE)[keyof typeof SOURCE_ERROR_CODE];

export type SourceErrorContextValue = string | number | boolean | null;

export interface SourceErrorOptions extends ErrorOptions {
  readonly retryable?: boolean;
  readonly context?: Readonly<Record<string, SourceErrorContextValue>>;
}

export class SourceError extends Error {
  readonly code: SourceErrorCode;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, SourceErrorContextValue>>;

  constructor(
    code: SourceErrorCode,
    message: string,
    options: SourceErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'SourceError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.context = Object.freeze({ ...options.context });
  }
}

export function isSourceError(error: unknown): error is SourceError {
  return error instanceof SourceError;
}
