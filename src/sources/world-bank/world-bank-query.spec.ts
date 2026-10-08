import type { DataQuery } from '../contracts/data-query.js';
import { SOURCE_ERROR_CODE } from '../contracts/source.error.js';
import { WORLD_BANK_RECORD_FIELDS } from './world-bank-catalog.js';
import { validateWorldBankQuery } from './world-bank-query.js';

function validQuery(overrides: Partial<DataQuery> = {}): DataQuery {
  return {
    sourceId: 'world-bank',
    datasetId: '2',
    schemaVersion: 1,
    filters: [
      { field: 'countryCode', operator: 'in', value: ['DEU', 'FIN'] },
      {
        field: 'indicatorCode',
        operator: 'eq',
        value: 'SP.POP.TOTL',
      },
    ],
    period: { field: 'year', fromYear: 2020, toYear: 2021 },
    fields: WORLD_BANK_RECORD_FIELDS,
    ...overrides,
  };
}

describe('validateWorldBankQuery', () => {
  it('returns a bounded source-specific selection', () => {
    expect(validateWorldBankQuery(validQuery())).toEqual({
      countryCodes: ['DEU', 'FIN'],
      indicatorCodes: ['SP.POP.TOTL'],
      fromYear: 2020,
      toYear: 2021,
      expectedPoints: 4,
    });
  });

  it.each([
    {
      name: 'another source',
      query: validQuery({ sourceId: 'fixture' }),
      code: SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
    },
    {
      name: 'another dataset',
      query: validQuery({ datasetId: '99' }),
      code: SOURCE_ERROR_CODE.DATASET_NOT_FOUND,
    },
    {
      name: 'an old schema',
      query: validQuery({ schemaVersion: 2 }),
      code: SOURCE_ERROR_CODE.SCHEMA_VERSION_MISMATCH,
    },
    {
      name: 'another temporal field',
      query: validQuery({
        period: { field: 'date', fromYear: 2020, toYear: 2021 },
      }),
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'field selection',
      query: validQuery({ fields: ['countryCode', 'value'] }),
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'an unknown measure',
      query: validQuery({
        filters: [
          { field: 'countryCode', operator: 'eq', value: 'DEU' },
          { field: 'indicatorCode', operator: 'eq', value: 'UNKNOWN' },
        ],
      }),
      code: SOURCE_ERROR_CODE.UNKNOWN_MEASURE,
    },
    {
      name: 'more than thirty years',
      query: validQuery({
        period: { field: 'year', fromYear: 1990, toYear: 2020 },
      }),
      code: SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
    },
  ])('rejects $name with $code', ({ query, code }) => {
    expect(() => validateWorldBankQuery(query)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects duplicate dimension values', () => {
    const query = validQuery({
      filters: [
        { field: 'countryCode', operator: 'in', value: ['DEU', 'DEU'] },
        {
          field: 'indicatorCode',
          operator: 'eq',
          value: 'SP.POP.TOTL',
        },
      ],
    });

    expect(() => validateWorldBankQuery(query)).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
      }),
    );
  });

  it('rejects a runtime value that only pretends to be DataQuery', () => {
    const malformed = { sourceId: 'world-bank' } as DataQuery;

    expect(() => validateWorldBankQuery(malformed)).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
        context: expect.objectContaining({ issueCount: expect.any(Number) }),
      }),
    );
  });
});
