import { Injectable } from '@nestjs/common';

import type {
  CursorPage,
  DataQuery,
  DataQualityWarning,
  DataRecord,
  DataSourceAdapter,
  DatasetSchema,
  DatasetSummary,
  DimensionValue,
  DimensionValuesRequest,
  MeasureDefinition,
  MeasuresRequest,
  RecordBatch,
} from '../contracts/index.js';
import { SOURCE_ERROR_CODE, SourceError } from '../contracts/index.js';
import {
  WORLD_BANK_DATASET_ID,
  WORLD_BANK_DATASET_SCHEMA,
  WORLD_BANK_DATASET_SUMMARY,
  WORLD_BANK_MEASURES,
  WORLD_BANK_SCHEMA_VERSION,
  WORLD_BANK_SOURCE_ID,
} from './world-bank-catalog.js';
import { WorldBankCountryCatalog } from './world-bank-country.catalog.js';
import { WorldBankDataLoader } from './world-bank-data.loader.js';
import type { WorldBankRecord } from './world-bank-data-page.js';
import { validateWorldBankQuery } from './world-bank-query.js';

@Injectable()
export class WorldBankAdapter implements DataSourceAdapter {
  readonly sourceId = WORLD_BANK_SOURCE_ID;

  constructor(
    private readonly dataLoader: WorldBankDataLoader,
    private readonly countryCatalog: WorldBankCountryCatalog,
  ) {}

  async listDatasets(signal?: AbortSignal): Promise<readonly DatasetSummary[]> {
    signal?.throwIfAborted();
    return [WORLD_BANK_DATASET_SUMMARY];
  }

  async describeDataset(
    datasetId: string,
    signal?: AbortSignal,
  ): Promise<DatasetSchema> {
    signal?.throwIfAborted();
    assertDataset(datasetId);
    return WORLD_BANK_DATASET_SCHEMA;
  }

  async listDimensionValues(
    request: DimensionValuesRequest,
    signal?: AbortSignal,
  ): Promise<CursorPage<DimensionValue>> {
    assertDataset(request.datasetId);

    if (request.field !== 'countryCode') {
      throw new SourceError(
        SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
        'World Bank dimension is not searchable',
        { context: { field: request.field } },
      );
    }

    const countries = await this.countryCatalog.listCountries(
      signal ?? new AbortController().signal,
    );
    const filtered = filterCatalogItems(countries, request.query);

    return paginate(filtered, request.cursor, request.limit);
  }

  async listMeasures(
    request: MeasuresRequest,
    signal?: AbortSignal,
  ): Promise<CursorPage<MeasureDefinition>> {
    signal?.throwIfAborted();
    assertDataset(request.datasetId);
    const measures = filterMeasures(WORLD_BANK_MEASURES, request.query);

    return paginate(measures, request.cursor, request.limit);
  }

  async fetchRecords(
    query: DataQuery,
    signal: AbortSignal,
  ): Promise<RecordBatch> {
    const selection = validateWorldBankQuery(query);
    const countries = await this.countryCatalog.listCountries(signal);
    const knownCountryCodes = new Set(
      countries.map((country) => country.value),
    );
    const unknownCountryCode = selection.countryCodes.find(
      (countryCode) => !knownCountryCodes.has(countryCode),
    );

    if (unknownCountryCode !== undefined) {
      throw new SourceError(
        SOURCE_ERROR_CODE.UNKNOWN_DIMENSION_VALUE,
        'World Bank country is unknown or is an aggregate',
        {
          context: {
            field: 'countryCode',
            value: unknownCountryCode,
          },
        },
      );
    }

    const series = await this.dataLoader.loadAll(
      {
        pathSegments: [
          'country',
          selection.countryCodes.join(';'),
          'indicator',
          selection.indicatorCodes.join(';'),
        ],
        query: {
          source: WORLD_BANK_DATASET_ID,
          date: `${selection.fromYear}:${selection.toYear}`,
          per_page: 1_000,
          footnote: 'y',
        },
      },
      signal,
    );

    if (series.metadata.sourceDatasetId !== WORLD_BANK_DATASET_ID) {
      throw new SourceError(
        SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
        'World Bank returned data from a different dataset',
        {
          context: {
            sourceId: WORLD_BANK_SOURCE_ID,
            sourceDatasetId: series.metadata.sourceDatasetId,
          },
        },
      );
    }

    validateReturnedRecords(series.records, selection);

    const warnings = buildWarnings(
      series.records,
      selection.countryCodes,
      selection.indicatorCodes,
      selection.fromYear,
      selection.toYear,
    );
    const availablePoints = series.records.filter(
      (record) => record.value !== null,
    ).length;

    return {
      records: series.records.map(toDataRecord),
      schemaVersion: WORLD_BANK_SCHEMA_VERSION,
      provenance: {
        sourceId: WORLD_BANK_SOURCE_ID,
        sourceDatasetId: WORLD_BANK_DATASET_ID,
        retrievedAt: new Date().toISOString(),
        sourceUpdatedAt: series.metadata.lastUpdated,
        pagesFetched: series.metadata.pagesFetched,
        retrieval: 'live',
      },
      transportComplete: true,
      coverage: {
        expectedPoints: selection.expectedPoints,
        availablePoints,
        missingPoints: selection.expectedPoints - availablePoints,
      },
      warnings,
    };
  }
}

interface ReturnedSelection {
  readonly countryCodes: readonly string[];
  readonly indicatorCodes: readonly string[];
  readonly fromYear: number;
  readonly toYear: number;
  readonly expectedPoints: number;
}

function assertDataset(datasetId: string): void {
  if (datasetId !== WORLD_BANK_DATASET_ID) {
    throw new SourceError(
      SOURCE_ERROR_CODE.DATASET_NOT_FOUND,
      'World Bank dataset is not supported',
      { context: { sourceId: WORLD_BANK_SOURCE_ID, datasetId } },
    );
  }
}

function filterCatalogItems(
  items: readonly DimensionValue[],
  query: string | undefined,
): readonly DimensionValue[] {
  const normalizedQuery = query?.trim().toLocaleLowerCase('en-US');

  if (!normalizedQuery) {
    return items;
  }

  return items.filter(
    (item) =>
      item.value.toLocaleLowerCase('en-US').includes(normalizedQuery) ||
      item.label.toLocaleLowerCase('en-US').includes(normalizedQuery),
  );
}

function filterMeasures(
  measures: readonly MeasureDefinition[],
  query: string | undefined,
): readonly MeasureDefinition[] {
  const normalizedQuery = query?.trim().toLocaleLowerCase('ru-RU');

  if (!normalizedQuery) {
    return measures;
  }

  return measures.filter((measure) =>
    [measure.id, measure.label, measure.description].some((text) =>
      text.toLocaleLowerCase('ru-RU').includes(normalizedQuery),
    ),
  );
}

function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
): CursorPage<T> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw invalidCatalogRequest('Catalog limit must be between 1 and 100', {
      limit,
    });
  }

  const offset = cursor === undefined ? 0 : decodeCursor(cursor);

  if (offset > items.length) {
    throw invalidCatalogRequest('Catalog cursor is outside the result set');
  }

  const nextOffset = offset + limit;

  return {
    items: items.slice(offset, nextOffset),
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw invalidCatalogRequest('Catalog cursor is invalid');
  }

  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const offset = Number(decoded);

  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    String(offset) !== decoded ||
    encodeCursor(offset) !== cursor
  ) {
    throw invalidCatalogRequest('Catalog cursor is invalid');
  }

  return offset;
}

function invalidCatalogRequest(
  message: string,
  context: Readonly<Record<string, string | number>> = {},
): SourceError {
  return new SourceError(SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION, message, {
    context,
  });
}

function validateReturnedRecords(
  records: readonly WorldBankRecord[],
  selection: ReturnedSelection,
): void {
  const countryCodes = new Set(selection.countryCodes);
  const indicatorCodes = new Set(selection.indicatorCodes);

  for (const record of records) {
    const belongsToQuery =
      countryCodes.has(record.countryCode) &&
      indicatorCodes.has(record.indicatorCode) &&
      record.year >= selection.fromYear &&
      record.year <= selection.toYear;

    if (!belongsToQuery) {
      throw new SourceError(
        SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
        'World Bank returned an observation outside the query',
        {
          context: {
            sourceId: WORLD_BANK_SOURCE_ID,
            countryCode: record.countryCode,
            indicatorCode: record.indicatorCode,
            year: record.year,
          },
        },
      );
    }
  }

  if (records.length > selection.expectedPoints) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'World Bank returned more observations than requested',
      {
        context: {
          sourceId: WORLD_BANK_SOURCE_ID,
          expectedPoints: selection.expectedPoints,
          actualPoints: records.length,
        },
      },
    );
  }
}

function buildWarnings(
  records: readonly WorldBankRecord[],
  countryCodes: readonly string[],
  indicatorCodes: readonly string[],
  fromYear: number,
  toYear: number,
): readonly DataQualityWarning[] {
  const warnings: DataQualityWarning[] = [];
  const recordsByKey = new Map(
    records.map((record) => [recordKey(record), record] as const),
  );

  for (const countryCode of countryCodes) {
    for (const indicatorCode of indicatorCodes) {
      for (let year = fromYear; year <= toYear; year += 1) {
        const key = { countryCode, indicatorCode, year };
        const record = recordsByKey.get(recordKey(key));

        if (record === undefined || record.value === null) {
          warnings.push({
            code: 'MISSING_OBSERVATION',
            recordKey: key,
            details: { reason: record === undefined ? 'absent' : 'null' },
          });
        }

        if (record?.footnote !== null && record?.footnote !== undefined) {
          warnings.push({
            code: 'SOURCE_FOOTNOTE',
            recordKey: key,
            details: { footnote: record.footnote },
          });
        }

        if (
          record?.observationStatus !== null &&
          record?.observationStatus !== undefined
        ) {
          warnings.push({
            code: 'SOURCE_STATUS',
            recordKey: key,
            details: { status: record.observationStatus },
          });
        }
      }
    }
  }

  return warnings;
}

function recordKey(record: {
  readonly countryCode: string;
  readonly indicatorCode: string;
  readonly year: number;
}): string {
  return [record.countryCode, record.indicatorCode, record.year].join('\u0000');
}

function toDataRecord(record: WorldBankRecord): DataRecord {
  return {
    sourceId: record.sourceId,
    sourceDatasetId: record.sourceDatasetId,
    countryCode: record.countryCode,
    indicatorCode: record.indicatorCode,
    year: record.year,
    value: record.value,
  };
}
