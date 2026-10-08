import { readFileSync } from 'node:fs';

import { isSourceError, SOURCE_ERROR_CODE } from '../contracts/index.js';
import { parseWorldBankDataPage } from './world-bank-data-page.js';

function readFixture(name: string): unknown {
  const url = new URL(
    `../../../test/fixtures/world-bank/${name}`,
    import.meta.url,
  );

  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

describe('parseWorldBankDataPage', () => {
  it('validates a saved response and normalizes it to flat records', () => {
    const page = parseWorldBankDataPage(readFixture('data-page-1.json'));

    expect(page.metadata).toEqual({
      page: 1,
      pages: 2,
      perPage: 1,
      total: 2,
      sourceDatasetId: '2',
      lastUpdated: '2026-07-13',
    });
    expect(page.records).toEqual([
      {
        sourceId: 'world-bank',
        sourceDatasetId: '2',
        countryCode: 'DEU',
        indicatorCode: 'SP.POP.TOTL',
        year: 2021,
        value: 83_196_078,
        footnote: null,
        observationStatus: null,
      },
    ]);
  });

  it('accepts a string per_page and preserves meaningful optional text', () => {
    const payload = readFixture('data-page-1.json') as [
      Record<string, unknown>,
      Array<Record<string, unknown>>,
    ];
    payload[0].per_page = '1';
    payload[1][0] = {
      ...payload[1][0],
      footnote: 'Provisional estimate',
      obs_status: 'E',
    };

    const page = parseWorldBankDataPage(payload);

    expect(page.metadata.perPage).toBe(1);
    expect(page.records[0]).toMatchObject({
      footnote: 'Provisional estimate',
      observationStatus: 'E',
    });
  });

  it('turns an API error payload into a domain error even with HTTP 200', () => {
    expect(() =>
      parseWorldBankDataPage(readFixture('api-error-invalid-country.json')),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
        retryable: false,
        context: {
          sourceId: 'world-bank',
          apiErrorId: '120',
          apiErrorKey: 'Invalid value',
        },
      }),
    );
  });

  it.each([
    { name: 'non-page JSON', payload: { page: 1 } },
    {
      name: 'a string observation value',
      payload: [
        {
          page: 1,
          pages: 1,
          per_page: 1,
          total: 1,
          sourceid: '2',
          lastupdated: '2026-07-13',
        },
        [
          {
            indicator: { id: 'SP.POP.TOTL', value: 'Population' },
            country: { id: 'DE', value: 'Germany' },
            countryiso3code: 'DEU',
            date: '2021',
            value: '83196078',
            decimal: 0,
          },
        ],
      ],
    },
  ])('rejects $name', ({ payload }) => {
    try {
      parseWorldBankDataPage(payload);
      expect.unreachable('The malformed payload must be rejected');
    } catch (error: unknown) {
      expect(isSourceError(error)).toBe(true);
      expect(error).toMatchObject({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
        context: { sourceId: 'world-bank' },
      });
    }
  });

  it('rejects internally inconsistent pagination metadata', () => {
    const payload = readFixture('data-page-1.json') as [
      Record<string, unknown>,
      unknown[],
    ];
    payload[0].page = 3;

    expect(() => parseWorldBankDataPage(payload)).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
        context: expect.objectContaining({ page: 3, pages: 2 }),
      }),
    );
  });
});
