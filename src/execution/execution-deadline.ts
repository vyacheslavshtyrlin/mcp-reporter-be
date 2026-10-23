import { EXECUTION_ERROR_CODE, ExecutionError } from './execution.error.js';

export const DEFAULT_REPORT_DEADLINE_MS = 30_000;

export class ExecutionDeadline {
  readonly signal: AbortSignal;

  private readonly controller = new AbortController();
  private readonly expiresAt: number;
  private readonly timeout: ReturnType<typeof setTimeout>;
  private readonly callerSignal: AbortSignal | undefined;
  private readonly onCallerAbort: (() => void) | undefined;

  constructor(timeoutMs: number, callerSignal?: AbortSignal) {
    this.signal = this.controller.signal;
    this.expiresAt = Date.now() + timeoutMs;
    this.callerSignal = callerSignal;
    this.timeout = setTimeout(() => this.abortForDeadline(), timeoutMs);
    this.timeout.unref();

    if (callerSignal !== undefined) {
      this.onCallerAbort = () => {
        this.controller.abort(
          new ExecutionError(
            EXECUTION_ERROR_CODE.REPORT_REQUEST_ABORTED,
            'Report execution was aborted by the caller',
            { cause: callerSignal.reason },
          ),
        );
      };

      if (callerSignal.aborted) {
        this.onCallerAbort();
      } else {
        callerSignal.addEventListener('abort', this.onCallerAbort, {
          once: true,
        });
      }
    }
  }

  throwIfInactive(): void {
    if (!this.signal.aborted && Date.now() >= this.expiresAt) {
      this.abortForDeadline();
    }

    if (this.signal.aborted) {
      throw this.signal.reason;
    }
  }

  dispose(): void {
    clearTimeout(this.timeout);
    if (this.onCallerAbort !== undefined) {
      this.callerSignal?.removeEventListener('abort', this.onCallerAbort);
    }
  }

  private abortForDeadline(): void {
    this.controller.abort(
      new ExecutionError(
        EXECUTION_ERROR_CODE.REPORT_DEADLINE_EXCEEDED,
        'Report execution deadline was exceeded',
      ),
    );
  }
}
