import { ZodError } from 'zod';

import { reportDefinition } from '../../test/helpers/report-fixtures.js';
import { parseReportDefinition } from './report-definition.schema.js';

describe('reportDefinitionSchema', () => {
  it('parses the strict runtime contract', () => {
    expect(parseReportDefinition(reportDefinition())).toEqual(
      reportDefinition(),
    );
  });

  it.each([
    {
      name: 'unknown properties',
      input: { ...reportDefinition(), unexpected: true },
    },
    {
      name: 'an empty measure list',
      input: reportDefinition({ measures: [] }),
    },
    {
      name: 'duplicate group fields',
      input: reportDefinition({ groupBy: ['countryCode', 'countryCode'] }),
    },
    {
      name: 'duplicate measures',
      input: reportDefinition({ measures: [{ id: 'POP' }, { id: 'POP' }] }),
    },
    {
      name: 'duplicate filter fields',
      input: reportDefinition({
        filters: [
          { field: 'countryCode', operator: 'eq', value: 'DEU' },
          { field: 'countryCode', operator: 'eq', value: 'FIN' },
        ],
      }),
    },
    {
      name: 'duplicate filter values',
      input: reportDefinition({
        filters: [
          {
            field: 'countryCode',
            operator: 'in',
            value: ['DEU', 'DEU'],
          },
        ],
      }),
    },
    {
      name: 'a reversed period',
      input: reportDefinition({
        period: { field: 'year', fromYear: 2022, toYear: 2020 },
      }),
    },
  ])('rejects $name', ({ input }) => {
    expect(() => parseReportDefinition(input)).toThrow(ZodError);
  });
});
