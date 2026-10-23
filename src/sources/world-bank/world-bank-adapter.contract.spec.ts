import { readFileSync } from 'node:fs';

import { Test, type TestingModule } from '@nestjs/testing';

import type { DataQuery, DataSourceAdapter } from '../contracts/index.js';
import { SOURCE_ERROR_CODE } from '../contracts/index.js';
import { WorldBankAdapter } from './world-bank-adapter.js';
import { WORLD_BANK_RECORD_FIELDS } from './world-bank-catalog.js';
import { WorldBankCountryCatalog } from './world-bank-country.catalog.js';
import {
  WorldBankDataLoader,
  type WorldBankJsonClient,
} from './world-bank-data.loader.js';
import type { WorldBankHttpRequest } from './world-bank-url.js';
import { WorldBankRetryPolicy } from './world-bank-retry.policy.js';

class FixtureWorldBankClient implements WorldBankJsonClient {
  readonly requests: WorldBankHttpRequest[] = [];

  constructor(
    private readonly countryPayload: unknown,
    private readonly dataPages: Readonly<Record<number, unknown>>,
  ) {}

  getJson(
    request: WorldBankHttpRequest,
    _signal: AbortSignal,
  ): Promise<unknown> {
    this.requests.push(request);

    if (request.pathSegments.length === 1) {
      return Promise.resolve(this.countryPayload);
    }

    const page = request.query?.page;

    if (typeof page !== 'number' || !(page in this.dataPages)) {
      return Promise.reject(new Error(`No fixture for data page ${page}`));
    }

    return Promise.resolve(this.dataPages[page]);
  }
}

function readFixture(name: string): unknown {
  const url = new URL(
    `../../../test/fixtures/world-bank/${name}`,
    import.meta.url,
  );

  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

function validQuery(): DataQuery {
  return {
    sourceId: 'world-bank',
    datasetId: '2',
    schemaVersion: 1,
    filters: [
      { field: 'countryCode', operator: 'eq', value: 'DEU' },
      {
        field: 'indicatorCode',
        operator: 'eq',
        value: 'SP.POP.TOTL',
      },
    ],
    period: { field: 'year', fromYear: 2020, toYear: 2021 },
    fields: WORLD_BANK_RECORD_FIELDS,
  };
}

async function createAdapter(
  client: FixtureWorldBankClient,
): Promise<{ adapter: DataSourceAdapter; module: TestingModule }> {
  const retryPolicy = new WorldBankRetryPolicy({
    sleep: () => Promise.resolve(),
  });
  const module = await Test.createTestingModule({
    providers: [
      WorldBankAdapter,
      {
        provide: WorldBankDataLoader,
        useValue: new WorldBankDataLoader(client, { retryPolicy }),
      },
      {
        provide: WorldBankCountryCatalog,
        useValue: new WorldBankCountryCatalog(client, retryPolicy),
      },
    ],
  }).compile();

  return {
    adapter: module.get(WorldBankAdapter),
    module,
  };
}

describe('WorldBankAdapter contract', () => {
  let modules: TestingModule[] = [];

  afterEach(async () => {
    await Promise.all(modules.map((module) => module.close()));
    modules = [];
  });

  it('describes one versioned dataset with five curated measures', async () => {
    const client = new FixtureWorldBankClient({}, {});
    const created = await createAdapter(client);
    modules.push(created.module);

    await expect(created.adapter.listDatasets()).resolves.toEqual([
      expect.objectContaining({
        datasetId: '2',
        schemaVersion: 1,
        title: 'World Development Indicators',
      }),
    ]);

    const schema = await created.adapter.describeDataset('2');
    expect(schema.measures).toHaveLength(5);
    expect(schema.keyFields).toEqual(['countryCode', 'indicatorCode', 'year']);
    expect(schema.capabilities.supportsFieldSelection).toBe(false);
    expect(client.requests).toHaveLength(0);
  });

  it('filters aggregates from countries and uses its own cursor', async () => {
    const countryPayload = readFixture(
      'countries-country-and-aggregate.json',
    ) as [Record<string, unknown>, Array<Record<string, unknown>>];
    countryPayload[0] = { ...countryPayload[0], total: 3 };
    countryPayload[1].push({
      ...countryPayload[1][0],
      id: 'FIN',
      iso2Code: 'FI',
      name: 'Finland',
    });
    const client = new FixtureWorldBankClient(countryPayload, {});
    const created = await createAdapter(client);
    modules.push(created.module);

    const firstPage = await created.adapter.listDimensionValues({
      datasetId: '2',
      field: 'countryCode',
      limit: 1,
    });

    expect(firstPage).toEqual({
      items: [{ value: 'FIN', label: 'Finland' }],
      nextCursor: expect.any(String),
    });
    const secondPage = await created.adapter.listDimensionValues({
      datasetId: '2',
      field: 'countryCode',
      cursor: firstPage.nextCursor ?? undefined,
      limit: 1,
    });
    expect(secondPage).toEqual({
      items: [{ value: 'DEU', label: 'Germany' }],
      nextCursor: null,
    });
    expect(client.requests[0]?.query).toMatchObject({
      format: 'json',
      page: 1,
      per_page: 400,
    });
  });

  it('searches and paginates the curated measure catalog', async () => {
    const client = new FixtureWorldBankClient({}, {});
    const created = await createAdapter(client);
    modules.push(created.module);

    const firstPage = await created.adapter.listMeasures({
      datasetId: '2',
      limit: 2,
    });
    const secondPage = await created.adapter.listMeasures({
      datasetId: '2',
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });
    const searched = await created.adapter.listMeasures({
      datasetId: '2',
      query: 'инфляц',
      limit: 10,
    });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(secondPage.items).toHaveLength(2);
    expect(searched.items.map((measure) => measure.id)).toEqual([
      'FP.CPI.TOTL.ZG',
    ]);
    expect(client.requests).toHaveLength(0);
  });

  it('returns a complete RecordBatch through the public contract', async () => {
    const client = new FixtureWorldBankClient(
      readFixture('countries-country-and-aggregate.json'),
      {
        1: readFixture('data-page-1.json'),
        2: readFixture('data-page-2.json'),
      },
    );
    const created = await createAdapter(client);
    modules.push(created.module);

    const batch = await created.adapter.fetchRecords(
      validQuery(),
      new AbortController().signal,
    );

    expect(batch.transportComplete).toBe(true);
    expect(batch.records).toEqual([
      {
        sourceId: 'world-bank',
        sourceDatasetId: '2',
        countryCode: 'DEU',
        indicatorCode: 'SP.POP.TOTL',
        year: 2020,
        value: 83_160_871,
      },
      {
        sourceId: 'world-bank',
        sourceDatasetId: '2',
        countryCode: 'DEU',
        indicatorCode: 'SP.POP.TOTL',
        year: 2021,
        value: 83_196_078,
      },
    ]);
    expect(batch.coverage).toEqual({
      expectedPoints: 2,
      availablePoints: 2,
      missingPoints: 0,
    });
    expect(batch.warnings).toEqual([]);
    expect(batch.provenance).toMatchObject({
      sourceId: 'world-bank',
      sourceDatasetId: '2',
      sourceUpdatedAt: '2026-07-13',
      pagesFetched: 2,
      retrieval: 'live',
    });
    expect(Date.parse(batch.provenance.retrievedAt)).not.toBeNaN();
  });

  it('returns multiple indicators when World Bank omits sourceid', async () => {
    const client = new FixtureWorldBankClient(
      readFixture('countries-country-and-aggregate.json'),
      { 1: readFixture('data-page-multiple-indicators.json') },
    );
    const created = await createAdapter(client);
    modules.push(created.module);
    const query = validQuery();
    const multiIndicatorQuery: DataQuery = {
      ...query,
      filters: [
        { field: 'countryCode', operator: 'eq', value: 'DEU' },
        {
          field: 'indicatorCode',
          operator: 'in',
          value: ['SP.POP.TOTL', 'FP.CPI.TOTL.ZG'],
        },
      ],
      period: { field: 'year', fromYear: 2020, toYear: 2020 },
    };

    const batch = await created.adapter.fetchRecords(
      multiIndicatorQuery,
      new AbortController().signal,
    );

    expect(batch.records).toHaveLength(2);
    expect(batch.coverage).toEqual({
      expectedPoints: 2,
      availablePoints: 2,
      missingPoints: 0,
    });
    expect(batch.provenance.sourceDatasetId).toBe('2');
    expect(client.requests.at(-1)?.pathSegments).toEqual([
      'country',
      'DEU',
      'indicator',
      'SP.POP.TOTL;FP.CPI.TOTL.ZG',
    ]);
  });

  it('reports null and absent grid points without inventing records', async () => {
    const onlyPage = readFixture('data-page-1.json') as [
      Record<string, unknown>,
      Array<Record<string, unknown>>,
    ];
    onlyPage[0] = { ...onlyPage[0], pages: 1, total: 1 };
    onlyPage[1][0] = {
      ...onlyPage[1][0],
      value: null,
      footnote: 'No estimate',
      obs_status: 'M',
    };
    const client = new FixtureWorldBankClient(
      readFixture('countries-country-and-aggregate.json'),
      { 1: onlyPage },
    );
    const created = await createAdapter(client);
    modules.push(created.module);

    const batch = await created.adapter.fetchRecords(
      validQuery(),
      new AbortController().signal,
    );

    expect(batch.records).toHaveLength(1);
    expect(batch.coverage).toEqual({
      expectedPoints: 2,
      availablePoints: 0,
      missingPoints: 2,
    });
    expect(batch.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_OBSERVATION' }),
        expect.objectContaining({ code: 'SOURCE_FOOTNOTE' }),
        expect.objectContaining({ code: 'SOURCE_STATUS' }),
      ]),
    );
    expect(
      batch.warnings.filter(
        (warning) => warning.code === 'MISSING_OBSERVATION',
      ),
    ).toHaveLength(2);
  });

  it('rejects an aggregate before requesting observations', async () => {
    const client = new FixtureWorldBankClient(
      readFixture('countries-country-and-aggregate.json'),
      {},
    );
    const created = await createAdapter(client);
    modules.push(created.module);
    const query = validQuery();
    const aggregateQuery: DataQuery = {
      ...query,
      filters: [
        { field: 'countryCode', operator: 'eq', value: 'WLD' },
        {
          field: 'indicatorCode',
          operator: 'eq',
          value: 'SP.POP.TOTL',
        },
      ],
    };

    await expect(
      created.adapter.fetchRecords(
        aggregateQuery,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.UNKNOWN_DIMENSION_VALUE,
      context: { field: 'countryCode', value: 'WLD' },
    });
    expect(client.requests).toHaveLength(1);
  });

  it('rejects malformed catalog cursors', async () => {
    const client = new FixtureWorldBankClient({}, {});
    const created = await createAdapter(client);
    modules.push(created.module);

    await expect(
      created.adapter.listMeasures({
        datasetId: '2',
        cursor: 'not+base64',
        limit: 2,
      }),
    ).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    });
  });
});
