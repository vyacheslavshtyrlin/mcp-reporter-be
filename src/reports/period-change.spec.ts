import {
  observation,
  recordBatch,
  validatedPlan,
} from '../../test/helpers/report-fixtures.js';
import { calculatePeriodChange } from './period-change.js';

describe('calculatePeriodChange', () => {
  it('calculates absolute, relative and percentage-point changes', () => {
    const plan = validatedPlan('period_change', {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      period: { field: 'year', fromYear: 2020, toYear: 2022 },
    });
    const batch = recordBatch([
      observation('DEU', 'POP', 2020, 100),
      observation('DEU', 'POP', 2022, 150),
      observation('DEU', 'RATE', 2020, 5),
      observation('DEU', 'RATE', 2022, 7),
    ]);

    const result = calculatePeriodChange(plan, batch);

    expect(result.kind).toBe('period_change');
    expect(result.engineVersion).toBe('1');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      measureId: 'POP',
      start: { status: 'available', year: 2020, value: 100 },
      end: { status: 'available', year: 2022, value: 150 },
      change: { status: 'available', kind: 'absolute', value: 50 },
      relativeChangePercent: {
        status: 'available',
        kind: 'relative_percent',
        value: 50,
      },
    });
    expect(result.rows[1]).toMatchObject({
      measureId: 'RATE',
      change: {
        status: 'available',
        kind: 'percentage_points',
        value: 2,
      },
      relativeChangePercent: {
        status: 'available',
        kind: 'relative_percent',
        value: 40,
      },
    });
    expect(result.sourceRecords).toBe(batch.records);
  });

  it.each([
    {
      name: 'an absent start observation',
      records: [observation('DEU', 'POP', 2022, 5)],
      endpoint: 'start',
      endpointReason: 'OBSERVATION_ABSENT',
      changeReason: 'START_OBSERVATION_ABSENT',
    },
    {
      name: 'a null start value',
      records: [
        observation('DEU', 'POP', 2020, null),
        observation('DEU', 'POP', 2022, 5),
      ],
      endpoint: 'start',
      endpointReason: 'VALUE_NULL',
      changeReason: 'START_VALUE_NULL',
    },
    {
      name: 'an absent end observation',
      records: [observation('DEU', 'POP', 2020, 5)],
      endpoint: 'end',
      endpointReason: 'OBSERVATION_ABSENT',
      changeReason: 'END_OBSERVATION_ABSENT',
    },
    {
      name: 'a null end value',
      records: [
        observation('DEU', 'POP', 2020, 5),
        observation('DEU', 'POP', 2022, null),
      ],
      endpoint: 'end',
      endpointReason: 'VALUE_NULL',
      changeReason: 'END_VALUE_NULL',
    },
  ] as const)(
    'marks the change unavailable for $name',
    ({ records, endpoint, endpointReason, changeReason }) => {
      const plan = validatedPlan('period_change', {
        filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
        measures: [{ id: 'POP' }],
        period: { field: 'year', fromYear: 2020, toYear: 2022 },
      });

      const row = calculatePeriodChange(plan, recordBatch(records)).rows[0];

      expect(row?.[endpoint]).toEqual({
        status: 'unavailable',
        year: endpoint === 'start' ? 2020 : 2022,
        value: null,
        reason: endpointReason,
      });
      expect(row?.change).toEqual({
        status: 'unavailable',
        kind: 'absolute',
        reason: changeReason,
      });
      expect(row?.relativeChangePercent).toEqual({
        status: 'unavailable',
        kind: 'relative_percent',
        reason: changeReason,
      });
    },
  );

  it.each([0, -5])(
    'keeps absolute change but rejects relative change for start %s',
    (startValue) => {
      const plan = validatedPlan('period_change', {
        filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
        measures: [{ id: 'POP' }],
        period: { field: 'year', fromYear: 2020, toYear: 2022 },
      });
      const row = calculatePeriodChange(
        plan,
        recordBatch([
          observation('DEU', 'POP', 2020, startValue),
          observation('DEU', 'POP', 2022, 5),
        ]),
      ).rows[0];

      expect(row?.change).toEqual({
        status: 'available',
        kind: 'absolute',
        value: 5 - startValue,
      });
      expect(row?.relativeChangePercent).toEqual({
        status: 'unavailable',
        kind: 'relative_percent',
        reason: 'NON_POSITIVE_START',
      });
    },
  );

  it.each([
    ['asc', ['DEU', 'FIN']],
    ['desc', ['FIN', 'DEU']],
  ] as const)(
    'sorts groups deterministically in %s order',
    (direction, expected) => {
      const plan = validatedPlan('period_change', {
        measures: [{ id: 'POP' }],
        period: { field: 'year', fromYear: 2020, toYear: 2022 },
        sort: { field: 'countryCode', direction },
      });
      const batch = recordBatch([
        observation('DEU', 'POP', 2020, 1),
        observation('DEU', 'POP', 2022, 2),
        observation('FIN', 'POP', 2020, 3),
        observation('FIN', 'POP', 2022, 4),
      ]);

      expect(
        calculatePeriodChange(plan, batch).rows.map(
          (row) => row.group.countryCode,
        ),
      ).toEqual(expected);
    },
  );
});
