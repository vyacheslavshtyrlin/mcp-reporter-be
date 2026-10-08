import { readFileSync } from 'node:fs';

import { SOURCE_ERROR_CODE, SourceError } from '../contracts/source.error.js';
import {
  WorldBankDataLoader,
  type WorldBankJsonClient,
} from './world-bank-data.loader.js';
import type { WorldBankHttpRequest } from './world-bank-url.js';
import { WorldBankRetryPolicy } from './world-bank-retry.policy.js';

type QueuedResult = unknown | (() => unknown | Promise<unknown>);

class QueueJsonClient implements WorldBankJsonClient {
  readonly requests: WorldBankHttpRequest[] = [];

  constructor(private readonly results: QueuedResult[]) {}

  async getJson(
    request: WorldBankHttpRequest,
    _signal: AbortSignal,
  ): Promise<unknown> {
    this.requests.push(request);
    const result = this.results.shift();

    if (result === undefined) {
      throw new Error('No queued World Bank response');
    }

    return typeof result === 'function' ? result() : result;
  }
}

const request: WorldBankHttpRequest = {
  pathSegments: ['country', 'DEU', 'indicator', 'SP.POP.TOTL'],
  query: { source: 2, date: '2020:2021', per_page: 1 },
};

function readFixture(name: string): unknown {
  const url = new URL(
    `../../../test/fixtures/world-bank/${name}`,
    import.meta.url,
  );

  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

function editableFixture(
  name: string,
): [Record<string, unknown>, Array<Record<string, unknown>>] {
  return readFixture(name) as [
    Record<string, unknown>,
    Array<Record<string, unknown>>,
  ];
}

function noRetryPolicy(): WorldBankRetryPolicy {
  return new WorldBankRetryPolicy({ maxAttempts: 1 });
}

describe('WorldBankDataLoader', () => {
  it('loads every page, checks completeness and sorts records by year', async () => {
    const client = new QueueJsonClient([
      readFixture('data-page-1.json'),
      readFixture('data-page-2.json'),
    ]);
    const loader = new WorldBankDataLoader(client);

    const series = await loader.loadAll(request, new AbortController().signal);

    expect(client.requests.map((item) => item.query?.page)).toEqual([1, 2]);
    expect(client.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.objectContaining({ format: 'json', source: 2 }),
        }),
      ]),
    );
    expect(series.metadata).toEqual({
      pagesFetched: 2,
      total: 2,
      perPage: 1,
      sourceDatasetId: '2',
      lastUpdated: '2026-07-13',
    });
    expect(series.records.map((record) => record.year)).toEqual([2020, 2021]);
    expect(series.coverage).toEqual({
      expectedPoints: 2,
      availablePoints: 2,
      missingPoints: 0,
    });
  });

  it('retries only the failed page and does not restart pagination', async () => {
    const temporaryFailure = new SourceError(
      SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
      'Temporary failure',
      { retryable: true },
    );
    const client = new QueueJsonClient([
      readFixture('data-page-1.json'),
      () => {
        throw temporaryFailure;
      },
      readFixture('data-page-2.json'),
    ]);
    const retryPolicy = new WorldBankRetryPolicy({
      sleep: () => Promise.resolve(),
    });
    const loader = new WorldBankDataLoader(client, { retryPolicy });

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).resolves.toMatchObject({ metadata: { pagesFetched: 2 } });
    expect(client.requests.map((item) => item.query?.page)).toEqual([1, 2, 2]);
  });

  it('counts null observations as missing without dropping them', async () => {
    const secondPage = editableFixture('data-page-2.json');
    secondPage[1][0] = { ...secondPage[1][0], value: null };
    const loader = new WorldBankDataLoader(
      new QueueJsonClient([readFixture('data-page-1.json'), secondPage]),
    );

    const series = await loader.loadAll(request, new AbortController().signal);

    expect(series.records).toHaveLength(2);
    expect(series.coverage).toEqual({
      expectedPoints: 2,
      availablePoints: 1,
      missingPoints: 1,
    });
  });

  it('does not return a partial result when a later page fails', async () => {
    const failure = new SourceError(
      SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
      'Second page failed',
      { retryable: true },
    );
    const loader = new WorldBankDataLoader(
      new QueueJsonClient([
        readFixture('data-page-1.json'),
        () => {
          throw failure;
        },
      ]),
      { retryPolicy: noRetryPolicy() },
    );

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).rejects.toBe(failure);
  });

  it('rejects metadata that changes between pages', async () => {
    const secondPage = editableFixture('data-page-2.json');
    secondPage[0].sourceid = '99';
    const loader = new WorldBankDataLoader(
      new QueueJsonClient([readFixture('data-page-1.json'), secondPage]),
      { retryPolicy: noRetryPolicy() },
    );

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      context: { sourceId: 'world-bank', page: 2 },
    });
  });

  it('rejects a page returned under the wrong number', async () => {
    const secondPage = editableFixture('data-page-2.json');
    secondPage[0].page = 1;
    const loader = new WorldBankDataLoader(
      new QueueJsonClient([readFixture('data-page-1.json'), secondPage]),
      { retryPolicy: noRetryPolicy() },
    );

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      context: {
        sourceId: 'world-bank',
        requestedPage: 2,
        returnedPage: 1,
      },
    });
  });

  it('rejects duplicate country, indicator and year keys', async () => {
    const secondPage = editableFixture('data-page-2.json');
    secondPage[1][0] = { ...secondPage[1][0], date: '2021' };
    const loader = new WorldBankDataLoader(
      new QueueJsonClient([readFixture('data-page-1.json'), secondPage]),
    );

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      context: {
        sourceId: 'world-bank',
        countryCode: 'DEU',
        indicatorCode: 'SP.POP.TOTL',
        year: 2021,
      },
    });
  });

  it('rejects a final record count different from total', async () => {
    const firstPage = editableFixture('data-page-1.json');
    const secondPage = editableFixture('data-page-2.json');
    firstPage[0].total = 3;
    secondPage[0].total = 3;
    const loader = new WorldBankDataLoader(
      new QueueJsonClient([firstPage, secondPage]),
    );

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      context: {
        sourceId: 'world-bank',
        expectedTotal: 3,
        actualTotal: 2,
      },
    });
  });

  it('stops before page two when the source total exceeds the limit', async () => {
    const client = new QueueJsonClient([readFixture('data-page-1.json')]);
    const loader = new WorldBankDataLoader(client, { maxRecords: 1 });

    await expect(
      loader.loadAll(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
      context: {
        sourceId: 'world-bank',
        recordCount: 2,
        maxRecords: 1,
      },
    });
    expect(client.requests).toHaveLength(1);
  });

  it('rejects a non-positive record limit', () => {
    expect(
      () => new WorldBankDataLoader(new QueueJsonClient([]), { maxRecords: 0 }),
    ).toThrow('positive integer');
  });
});
