import {
  observation,
  recordBatch,
  validatedPlan,
} from '../../test/helpers/report-fixtures.js';
import { SOURCE_ERROR_CODE } from '../sources/contracts/index.js';
import { calculateTimeSeries } from './time-series.js';

describe('calculateTimeSeries', () => {
  it('builds a deterministic grid for multiple groups and measures', () => {
    const plan = validatedPlan('time_series', {
      period: { field: 'year', fromYear: 2020, toYear: 2021 },
      sort: { field: 'countryCode', direction: 'desc' },
    });
    const batch = recordBatch(
      [
        observation('DEU', 'POP', 2020, 100),
        observation('DEU', 'POP', 2021, null),
        observation('DEU', 'RATE', 2020, 5),
        observation('DEU', 'RATE', 2021, 7),
        observation('FIN', 'POP', 2020, 200),
        observation('FIN', 'RATE', 2020, 2),
        observation('FIN', 'RATE', 2021, 3),
      ],
      {
        coverage: {
          expectedPoints: 8,
          availablePoints: 6,
          missingPoints: 2,
        },
        warnings: [
          {
            code: 'MISSING_OBSERVATION',
            details: { reason: 'fixture' },
          },
        ],
      },
    );

    const result = calculateTimeSeries(plan, batch);

    expect(result.kind).toBe('time_series');
    expect(result.engineVersion).toBe('1');
    expect(result.rows).toHaveLength(8);
    expect(result.rows[0]?.group).toEqual({ countryCode: 'FIN' });
    expect(result.rows).toContainEqual({
      group: { countryCode: 'DEU' },
      year: 2021,
      measureId: 'POP',
      unit: 'people',
      value: null,
      availability: 'null',
    });
    expect(result.rows).toContainEqual({
      group: { countryCode: 'FIN' },
      year: 2021,
      measureId: 'POP',
      unit: 'people',
      value: null,
      availability: 'absent',
    });
    expect(result.coverage).toBe(batch.coverage);
    expect(result.warnings).toBe(batch.warnings);
    expect(result.provenance).toBe(batch.provenance);
    expect(result.sourceRecords).toBe(batch.records);
  });

  it('sorts years in the requested direction with deterministic fallbacks', () => {
    const plan = validatedPlan('time_series', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2022 },
      sort: { field: 'year', direction: 'desc' },
    });
    const batch = recordBatch([
      observation('DEU', 'POP', 2020, 100),
      observation('DEU', 'POP', 2021, 110),
      observation('DEU', 'POP', 2022, 120),
    ]);

    expect(
      calculateTimeSeries(plan, batch).rows.map((row) => row.year),
    ).toEqual([2022, 2021, 2020]);
  });

  it('sorts groups in ascending order', () => {
    const plan = validatedPlan('time_series', {
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
      sort: { field: 'countryCode', direction: 'asc' },
    });
    const batch = recordBatch([
      observation('FIN', 'POP', 2020, 200),
      observation('DEU', 'POP', 2020, 100),
    ]);

    expect(
      calculateTimeSeries(plan, batch).rows.map((row) => row.group.countryCode),
    ).toEqual(['DEU', 'FIN']);
  });

  it('rejects duplicate observations for one report cell', () => {
    const plan = validatedPlan('time_series', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
    });
    const duplicate = observation('DEU', 'POP', 2020, 100);

    expect(() =>
      calculateTimeSeries(plan, recordBatch([duplicate, duplicate])),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      }),
    );
  });

  it('rejects a non-numeric measure value', () => {
    const plan = validatedPlan('time_series', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
    });
    const invalidRecord = {
      ...observation('DEU', 'POP', 2020, 100),
      value: 'not-a-number',
    };

    expect(() =>
      calculateTimeSeries(plan, recordBatch([invalidRecord])),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      }),
    );
  });

  it('rejects a non-finite numeric measure value', () => {
    const plan = validatedPlan('time_series', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
    });
    const invalidRecord = {
      ...observation('DEU', 'POP', 2020, 100),
      value: Number.POSITIVE_INFINITY,
    };

    expect(() =>
      calculateTimeSeries(plan, recordBatch([invalidRecord])),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      }),
    );
  });
});
