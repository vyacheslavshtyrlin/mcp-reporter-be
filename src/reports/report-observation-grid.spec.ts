import {
  observation,
  recordBatch,
  validatedPlan,
} from '../../test/helpers/report-fixtures.js';
import { SOURCE_ERROR_CODE } from '../sources/contracts/index.js';
import {
  buildObservationCells,
  compareGroups,
  compareValues,
} from './report-observation-grid.js';

describe('report observation grid helpers', () => {
  it.each([
    [1, 1, 0],
    [null, 1, 1],
    [1, null, -1],
    [2, 1, 1],
    [false, true, -1],
    ['DEU', 'FIN', -1],
  ] as const)('compares %s with %s', (left, right, direction) => {
    expect(Math.sign(compareValues(left, right))).toBe(direction);
  });

  it('compares compound groups and equal groups deterministically', () => {
    expect(
      compareGroups(
        { region: 'EU', country: 'DEU' },
        { region: 'EU', country: 'FIN' },
        ['region', 'country'],
      ),
    ).toBeLessThan(0);
    expect(
      compareGroups({ country: 'DEU' }, { country: 'DEU' }, ['country']),
    ).toBe(0);
  });

  it('derives an unfiltered group from normalized records', () => {
    const plan = validatedPlan('time_series', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      groupBy: ['sourceId'],
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
    });

    expect(
      buildObservationCells(
        plan,
        recordBatch([
          observation('DEU', 'POP', 2020, 100),
          {
            indicatorCode: 'POP',
            year: 2020,
            value: 50,
          },
          {
            sourceId: null,
            indicatorCode: 'POP',
            year: 2020,
            value: 75,
          },
        ]),
        [2020],
      ),
    ).toMatchObject([
      {
        group: { sourceId: 'fixture' },
        value: 100,
        availability: 'available',
      },
    ]);
  });

  it('supports a measure without a selector', () => {
    const base = validatedPlan('time_series').schema;
    const schema = {
      ...base,
      measures: [
        {
          id: 'POP',
          label: 'Population',
          description: 'Population fixture without a selector',
          valueField: 'value',
          unit: 'people',
          semanticType: 'count' as const,
          allowedOperations: ['time_series', 'period_change'] as const,
        },
      ],
    };
    const plan = validatedPlan(
      'time_series',
      {
        filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
        measures: [{ id: 'POP' }],
        period: { field: 'year', fromYear: 2020, toYear: 2020 },
      },
      schema,
    );

    expect(
      buildObservationCells(
        plan,
        recordBatch([observation('DEU', 'IGNORED', 2020, 100)]),
        [2020],
      )[0]?.value,
    ).toBe(100);
  });

  it('rejects a grid above the point limit even with one group', () => {
    const plan = validatedPlan('time_series', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      measures: [{ id: 'POP' }],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
    });

    expect(() =>
      buildObservationCells(
        plan,
        recordBatch([]),
        Array.from({ length: 1_501 }, (_, index) => index),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
      }),
    );
  });

  it('rejects a derived grid with more than ten groups', () => {
    const schema = {
      ...validatedPlan('time_series').schema,
      fields: validatedPlan('time_series').schema.fields.map((field) =>
        field.name === 'sourceId'
          ? { ...field, filterOperators: ['eq'] as const }
          : field,
      ),
    };
    const plan = validatedPlan(
      'time_series',
      {
        filters: [{ field: 'sourceId', operator: 'eq', value: 'fixture' }],
        groupBy: ['countryCode'],
        measures: [{ id: 'POP' }],
        period: { field: 'year', fromYear: 2020, toYear: 2020 },
      },
      schema,
    );
    const records = Array.from({ length: 11 }, (_, index) =>
      observation(`C${index}`, 'POP', 2020, index),
    );

    expect(() =>
      buildObservationCells(plan, recordBatch(records), [2020]),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
      }),
    );
  });
});
