import type { DataCoverage } from '../contracts/record-batch.js';
import { SOURCE_ERROR_CODE, SourceError } from '../contracts/source.error.js';
import {
  parseWorldBankDataPage,
  type WorldBankDataPage,
  type WorldBankPageMetadata,
  type WorldBankRecord,
} from './world-bank-data-page.js';
import type { WorldBankHttpRequest } from './world-bank-url.js';
import { WorldBankRetryPolicy } from './world-bank-retry.policy.js';

const DEFAULT_MAX_RECORDS = 1_500;

export interface WorldBankJsonClient {
  getJson(request: WorldBankHttpRequest, signal: AbortSignal): Promise<unknown>;
}

export interface WorldBankDataLoaderOptions {
  readonly maxRecords?: number;
  readonly retryPolicy?: WorldBankRetryPolicy;
}

export interface WorldBankSeriesMetadata {
  readonly pagesFetched: number;
  readonly total: number;
  readonly perPage: number;
  readonly sourceDatasetId: string;
  readonly lastUpdated: string;
}

export interface WorldBankSeries {
  readonly metadata: WorldBankSeriesMetadata;
  readonly records: readonly WorldBankRecord[];
  readonly coverage: DataCoverage;
}

export class WorldBankDataLoader {
  private readonly maxRecords: number;
  private readonly retryPolicy: WorldBankRetryPolicy;

  constructor(
    private readonly client: WorldBankJsonClient,
    options: WorldBankDataLoaderOptions = {},
  ) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.retryPolicy = options.retryPolicy ?? new WorldBankRetryPolicy();

    if (!Number.isInteger(this.maxRecords) || this.maxRecords <= 0) {
      throw new RangeError(
        'World Bank record limit must be a positive integer',
      );
    }
  }

  async loadAll(
    request: WorldBankHttpRequest,
    signal: AbortSignal,
  ): Promise<WorldBankSeries> {
    const records: WorldBankRecord[] = [];
    let firstMetadata: WorldBankPageMetadata | undefined;

    for (let pageNumber = 1; ; pageNumber += 1) {
      const page = await this.loadPage(request, pageNumber, signal);

      if (firstMetadata === undefined) {
        firstMetadata = page.metadata;
        this.assertWithinLimit(firstMetadata.total);
      } else {
        assertMatchingMetadata(firstMetadata, page.metadata);
      }

      if (page.metadata.page !== pageNumber) {
        throw invalidPageError(
          'World Bank returned an unexpected page number',
          {
            requestedPage: pageNumber,
            returnedPage: page.metadata.page,
          },
        );
      }

      records.push(...page.records);
      this.assertWithinLimit(records.length);

      if (pageNumber === firstMetadata.pages) {
        break;
      }
    }

    if (firstMetadata === undefined) {
      throw new Error('World Bank loader ended without loading a page');
    }

    if (records.length !== firstMetadata.total) {
      throw invalidPageError(
        'World Bank returned an unexpected total number of records',
        {
          expectedTotal: firstMetadata.total,
          actualTotal: records.length,
        },
      );
    }

    const sortedRecords = sortAndValidateUniqueRecords(records);
    const availablePoints = sortedRecords.filter(
      (record) => record.value !== null,
    ).length;

    return {
      metadata: {
        pagesFetched: firstMetadata.pages,
        total: firstMetadata.total,
        perPage: firstMetadata.perPage,
        sourceDatasetId: firstMetadata.sourceDatasetId,
        lastUpdated: firstMetadata.lastUpdated,
      },
      records: sortedRecords,
      coverage: {
        expectedPoints: firstMetadata.total,
        availablePoints,
        missingPoints: firstMetadata.total - availablePoints,
      },
    };
  }

  private async loadPage(
    request: WorldBankHttpRequest,
    pageNumber: number,
    signal: AbortSignal,
  ): Promise<WorldBankDataPage> {
    return this.retryPolicy.execute(async () => {
      const payload = await this.client.getJson(
        {
          ...request,
          query: {
            ...request.query,
            format: 'json',
            page: pageNumber,
          },
        },
        signal,
      );

      return parseWorldBankDataPage(payload);
    }, signal);
  }

  private assertWithinLimit(recordCount: number): void {
    if (recordCount > this.maxRecords) {
      throw new SourceError(
        SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
        'World Bank result exceeds the configured record limit',
        {
          context: {
            sourceId: 'world-bank',
            recordCount,
            maxRecords: this.maxRecords,
          },
        },
      );
    }
  }
}

function assertMatchingMetadata(
  expected: WorldBankPageMetadata,
  actual: WorldBankPageMetadata,
): void {
  const matches =
    actual.pages === expected.pages &&
    actual.perPage === expected.perPage &&
    actual.total === expected.total &&
    actual.sourceDatasetId === expected.sourceDatasetId &&
    actual.lastUpdated === expected.lastUpdated;

  if (!matches) {
    throw invalidPageError('World Bank changed metadata between pages', {
      page: actual.page,
    });
  }
}

function sortAndValidateUniqueRecords(
  records: readonly WorldBankRecord[],
): readonly WorldBankRecord[] {
  const keys = new Set<string>();

  for (const record of records) {
    const key = [record.countryCode, record.indicatorCode, record.year].join(
      '\u0000',
    );

    if (keys.has(key)) {
      throw invalidPageError('World Bank returned a duplicate observation', {
        countryCode: record.countryCode,
        indicatorCode: record.indicatorCode,
        year: record.year,
      });
    }

    keys.add(key);
  }

  return records.toSorted(
    (left, right) =>
      left.countryCode.localeCompare(right.countryCode) ||
      left.indicatorCode.localeCompare(right.indicatorCode) ||
      left.year - right.year,
  );
}

function invalidPageError(
  message: string,
  context: Readonly<Record<string, string | number>>,
): SourceError {
  return new SourceError(SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID, message, {
    context: { sourceId: 'world-bank', ...context },
  });
}
