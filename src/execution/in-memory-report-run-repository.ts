import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  ReportDefinitionInput,
  ReportResult,
} from '../reports/report.models.js';
import { EXECUTION_ERROR_CODE, ExecutionError } from './execution.error.js';
import type {
  CompletedReportRun,
  FailedReportRun,
  ReportRun,
  ReportRunError,
  ReportRunPage,
  ReportRunPageRequest,
  ReportRunSummary,
  RunningReportRun,
} from './execution.models.js';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class InMemoryReportRunRepository {
  private readonly runs = new Map<string, ReportRun>();

  create(definition: ReportDefinitionInput): ReportRun {
    const run = immutable<ReportRun>({
      id: randomUUID(),
      definition,
      status: 'queued',
      createdAt: now(),
    });
    this.runs.set(run.id, run);
    return run;
  }

  claim(runId: string): RunningReportRun {
    const run = this.require(runId);
    if (run.status !== 'queued') {
      throw invalidTransition(runId, run.status, 'running');
    }

    const running = immutable<RunningReportRun>({
      ...run,
      status: 'running',
      startedAt: now(),
    });
    this.runs.set(runId, running);
    return running;
  }

  complete(runId: string, result: ReportResult): CompletedReportRun {
    const run = this.require(runId);
    if (run.status !== 'running') {
      throw invalidTransition(runId, run.status, 'completed');
    }

    const completed = immutable<CompletedReportRun>({
      ...run,
      status: 'completed',
      finishedAt: now(),
      result,
    });
    this.runs.set(runId, completed);
    return completed;
  }

  fail(runId: string, error: ReportRunError): FailedReportRun {
    const run = this.require(runId);
    if (run.status !== 'running') {
      throw invalidTransition(runId, run.status, 'failed');
    }

    const failed = immutable<FailedReportRun>({
      ...run,
      status: 'failed',
      finishedAt: now(),
      error,
    });
    this.runs.set(runId, failed);
    return failed;
  }

  get(runId: string): ReportRun {
    return this.require(runId);
  }

  getPage(runId: string, request: ReportRunPageRequest): ReportRunPage {
    assertPageLimit(request.limit);
    const run = this.require(runId);
    const offset = decodeCursor(request.cursor, runId);

    if (run.status !== 'completed') {
      if (offset !== 0) {
        throw invalidPage('A cursor cannot be used before a run completes');
      }
      return immutable({ run, rows: [], nextCursor: null });
    }

    const rows = run.result.rows.slice(offset, offset + request.limit);
    const nextOffset = offset + rows.length;
    const nextCursor =
      nextOffset < run.result.rows.length
        ? encodeCursor(runId, nextOffset)
        : null;

    return immutable({
      run: toSummary(run),
      rows,
      nextCursor,
    });
  }

  private require(runId: string): ReportRun {
    const run = this.runs.get(runId);
    if (run === undefined) {
      throw new ExecutionError(
        EXECUTION_ERROR_CODE.REPORT_RUN_NOT_FOUND,
        'Report run was not found',
      );
    }
    return run;
  }
}

function toSummary(run: CompletedReportRun): ReportRunSummary {
  const { rows: _rows, sourceRecords: _sourceRecords, ...result } = run.result;
  return { ...run, result };
}

function assertPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw invalidPage(`Page limit must be between 1 and ${MAX_PAGE_SIZE}`);
  }
}

function encodeCursor(runId: string, offset: number): string {
  return Buffer.from(JSON.stringify({ version: 1, runId, offset })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string | undefined, runId: string): number {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      decoded.version !== 1 ||
      decoded.runId !== runId ||
      typeof decoded.offset !== 'number' ||
      !Number.isInteger(decoded.offset) ||
      decoded.offset < 0
    ) {
      throw new Error('Invalid cursor payload');
    }
    return decoded.offset;
  } catch (error: unknown) {
    throw invalidPage('Report run cursor is invalid', error);
  }
}

function invalidTransition(
  runId: string,
  from: ReportRun['status'],
  to: ReportRun['status'],
): ExecutionError {
  return new ExecutionError(
    EXECUTION_ERROR_CODE.INVALID_REPORT_RUN_TRANSITION,
    `Report run ${runId} cannot transition from ${from} to ${to}`,
  );
}

function invalidPage(message: string, cause?: unknown): ExecutionError {
  return new ExecutionError(
    EXECUTION_ERROR_CODE.INVALID_REPORT_RUN_PAGE,
    message,
    { cause },
  );
}

function immutable<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function now(): string {
  return new Date().toISOString();
}
