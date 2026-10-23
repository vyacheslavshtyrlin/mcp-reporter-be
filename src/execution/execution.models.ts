import type {
  PeriodChangeRow,
  ReportDefinitionInput,
  ReportResult,
  TimeSeriesRow,
} from '../reports/report.models.js';
import type {
  DataCoverage,
  DataQualityWarning,
  SourceProvenance,
} from '../sources/contracts/index.js';
import type { ReportRunErrorCode } from './execution.error.js';

export type ReportRunStatus = 'queued' | 'running' | 'completed' | 'failed';

interface ReportRunBase {
  readonly id: string;
  readonly definition: ReportDefinitionInput;
  readonly createdAt: string;
}

export interface QueuedReportRun extends ReportRunBase {
  readonly status: 'queued';
}

export interface RunningReportRun extends ReportRunBase {
  readonly status: 'running';
  readonly startedAt: string;
}

export interface CompletedReportRun extends ReportRunBase {
  readonly status: 'completed';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly result: ReportResult;
}

export interface ReportRunError {
  readonly code: ReportRunErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface FailedReportRun extends ReportRunBase {
  readonly status: 'failed';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly error: ReportRunError;
}

export type ReportRun =
  QueuedReportRun | RunningReportRun | CompletedReportRun | FailedReportRun;

export type ReportRow = TimeSeriesRow | PeriodChangeRow;

export interface ReportResultMetadata {
  readonly kind: ReportResult['kind'];
  readonly engineVersion: ReportResult['engineVersion'];
  readonly coverage: DataCoverage;
  readonly warnings: readonly DataQualityWarning[];
  readonly provenance: SourceProvenance;
  readonly transportComplete: true;
}

export type ReportRunSummary =
  | QueuedReportRun
  | RunningReportRun
  | FailedReportRun
  | (Omit<CompletedReportRun, 'result'> & {
      readonly result: ReportResultMetadata;
    });

export interface ReportRunPageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

export interface ReportRunPage {
  readonly run: ReportRunSummary;
  readonly rows: readonly ReportRow[];
  readonly nextCursor: string | null;
}
