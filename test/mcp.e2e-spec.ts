import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import type {
  CursorPage,
  DataSourceAdapter,
  DatasetSummary,
  DimensionValue,
  MeasureDefinition,
} from '../src/sources/contracts/index.js';
import { DATA_SOURCE_ADAPTERS } from '../src/sources/sources.tokens.js';
import {
  observation,
  recordBatch,
  REPORT_TEST_SCHEMA,
  reportDefinition,
} from './helpers/report-fixtures.js';

describe('MCP Streamable HTTP transport (e2e)', () => {
  let app: INestApplication;
  let client: Client;
  let resourcesClosed = false;
  const cancellation: CancellationProbe = {};

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATA_SOURCE_ADAPTERS)
      .useValue([fixtureAdapter(cancellation)])
      .compile();

    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');

    client = new Client(
      { name: 'mcp-reporter-e2e', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`${await app.getUrl()}/mcp`),
    );
    await client.connect(transport);
  });

  afterAll(async () => {
    if (!resourcesClosed) {
      await client.close();
      await app.close();
    }
  });

  it('publishes the complete tool catalog', async () => {
    const result = await client.listTools();

    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    expect(result.tools.map(({ name }) => name).sort()).toEqual([
      'describe_dataset',
      'get_report_run',
      'list_datasets',
      'list_dimension_values',
      'list_measures',
      'run_report',
    ]);
    expect(result.tools.every((tool) => tool.inputSchema !== undefined)).toBe(
      true,
    );
    expect(result.tools.every((tool) => tool.outputSchema !== undefined)).toBe(
      true,
    );
  });

  it('serves catalog tools with structured results', async () => {
    const datasets = await call('list_datasets', { sourceId: 'fixture' });
    const description = await call('describe_dataset', {
      sourceId: 'fixture',
      datasetId: 'climate',
    });
    const dimensions = await call('list_dimension_values', {
      sourceId: 'fixture',
      datasetId: 'climate',
      field: 'countryCode',
    });
    const measures = await call('list_measures', {
      sourceId: 'fixture',
      datasetId: 'climate',
    });

    expect(datasets).toMatchObject({
      ok: true,
      data: { datasets: [{ sourceId: 'fixture', datasetId: 'climate' }] },
    });
    expect(description).toMatchObject({
      ok: true,
      data: { dataset: { version: 1, temporalField: 'year' } },
    });
    expect(dimensions).toEqual({
      ok: true,
      data: {
        items: [{ value: 'DEU', label: 'Germany' }],
        nextCursor: null,
      },
    });
    expect(measures).toMatchObject({
      ok: true,
      data: { items: [{ id: 'POP' }, { id: 'RATE' }], nextCursor: null },
    });
  });

  it('runs a report and reads the stored run by its ID', async () => {
    const started = await call('run_report', {
      definition: reportDefinition({ measures: [{ id: 'POP' }] }),
      limit: 2,
    });
    const runId = getCompletedRunId(started);

    expect(started).toMatchObject({
      ok: true,
      data: {
        run: { id: runId, status: 'completed' },
      },
    });
    expect((started.data as { rows: readonly unknown[] }).rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ measureId: 'POP' })]),
    );

    await expect(
      call('get_report_run', { runId, limit: 10 }),
    ).resolves.toMatchObject({
      ok: true,
      data: { run: { id: runId, status: 'completed' } },
    });
  });

  it('returns period change for the exact endpoint years through MCP', async () => {
    const result = await call('run_report', {
      definition: reportDefinition({
        kind: 'period_change',
        filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
        measures: [{ id: 'RATE' }],
      }),
      limit: 10,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        run: {
          status: 'completed',
          result: {
            kind: 'period_change',
            coverage: {
              expectedPoints: 3,
              availablePoints: 2,
              missingPoints: 1,
            },
            warnings: [
              {
                code: 'MISSING_OBSERVATION',
                recordKey: {
                  countryCode: 'DEU',
                  indicatorCode: 'RATE',
                  year: 2022,
                },
                details: { reason: 'null' },
              },
            ],
          },
        },
        rows: [
          {
            group: { countryCode: 'DEU' },
            measureId: 'RATE',
            start: { status: 'available', year: 2020, value: 5 },
            end: {
              status: 'unavailable',
              year: 2022,
              value: null,
              reason: 'VALUE_NULL',
            },
            change: {
              status: 'unavailable',
              kind: 'percentage_points',
              reason: 'END_VALUE_NULL',
            },
            relativeChangePercent: {
              status: 'unavailable',
              kind: 'relative_percent',
              reason: 'END_VALUE_NULL',
            },
          },
        ],
        nextCursor: null,
      },
    });
  });

  it('returns a stable tool error for an unknown run', async () => {
    const result = await client.callTool({
      name: 'get_report_run',
      arguments: { runId: '00000000-0000-4000-8000-000000000000' },
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: 'REPORT_RUN_NOT_FOUND',
          retryable: false,
        },
      },
    });
  });

  it('propagates client cancellation to the source AbortSignal', async () => {
    const started = deferred();
    const aborted = deferred();
    cancellation.pending = {
      started: started.resolve,
      aborted: aborted.resolve,
    };
    const controller = new AbortController();

    const result = client.callTool(
      {
        name: 'run_report',
        arguments: {
          definition: reportDefinition({ measures: [{ id: 'POP' }] }),
        },
      },
      { signal: controller.signal },
    );
    await started.promise;
    controller.abort();

    await expect(result).rejects.toThrow(/AbortError/);
    await expect(aborted.promise).resolves.toBeUndefined();
  });

  it('rejects non-local Host headers before MCP processing', async () => {
    await request(app.getHttpServer())
      .post('/mcp')
      .set('Host', 'attacker.example')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      .expect(403);
  });

  it('rejects tool input outside the published Zod contract', async () => {
    const result = await client.callTool({
      name: 'list_datasets',
      arguments: { sourceId: 'fixture', limit: 101 },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('limit'),
        }),
      ],
    });
  });

  it('aborts an active source request during application shutdown', async () => {
    const started = deferred();
    const aborted = deferred();
    cancellation.pending = {
      started: started.resolve,
      aborted: aborted.resolve,
    };

    const result = client
      .callTool({
        name: 'run_report',
        arguments: {
          definition: reportDefinition({ measures: [{ id: 'POP' }] }),
        },
      })
      .catch((error: unknown) => error);
    await started.promise;
    const closing = app.close();

    await expect(aborted.promise).resolves.toBeUndefined();
    await client.close();
    await closing;
    resourcesClosed = true;
    await expect(result).resolves.toBeInstanceOf(Error);
  });

  async function call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toBeDefined();
    return result.structuredContent as Record<string, unknown>;
  }
});

function getCompletedRunId(result: Record<string, unknown>): string {
  const data = result.data as { run: { id: string; status: string } };
  expect(data.run.status).toBe('completed');
  return data.run.id;
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface CancellationProbe {
  pending?: {
    readonly started: () => void;
    readonly aborted: () => void;
  };
}

function fixtureAdapter(cancellation: CancellationProbe): DataSourceAdapter {
  const summary: DatasetSummary = {
    datasetId: 'climate',
    title: REPORT_TEST_SCHEMA.title,
    description: REPORT_TEST_SCHEMA.description,
    schemaVersion: REPORT_TEST_SCHEMA.version,
  };
  const dimensionPage: CursorPage<DimensionValue> = {
    items: [{ value: 'DEU', label: 'Germany' }],
    nextCursor: null,
  };
  const measurePage: CursorPage<MeasureDefinition> = {
    items: REPORT_TEST_SCHEMA.measures,
    nextCursor: null,
  };

  return {
    sourceId: 'fixture',
    listDatasets: vi.fn(async () => [summary]),
    describeDataset: vi.fn(async () => REPORT_TEST_SCHEMA),
    listDimensionValues: vi.fn(async () => dimensionPage),
    listMeasures: vi.fn(async () => measurePage),
    fetchRecords: vi.fn<DataSourceAdapter['fetchRecords']>(
      async (query, signal) => {
        const pending = cancellation.pending;
        if (pending !== undefined) {
          cancellation.pending = undefined;
          pending.started();
          return new Promise<never>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                pending.aborted();
                reject(signal.reason);
              },
              { once: true },
            );
          });
        }

        const records = [
          observation('DEU', 'POP', 2020, 100),
          observation('DEU', 'POP', 2021, 110),
          observation('DEU', 'POP', 2022, 120),
          observation('FIN', 'POP', 2020, 200),
          observation('FIN', 'POP', 2021, 210),
          observation('FIN', 'POP', 2022, 220),
          observation('DEU', 'RATE', 2020, 5),
          observation('DEU', 'RATE', 2021, 6),
          observation('DEU', 'RATE', 2022, null),
        ].filter(
          (record) =>
            typeof record.year === 'number' &&
            record.year >= query.period.fromYear &&
            record.year <= query.period.toYear &&
            query.filters.every((filter) =>
              filter.operator === 'eq'
                ? record[filter.field] === filter.value
                : filter.value.some((value) => record[filter.field] === value),
            ),
        );

        return recordBatch(records, {
          warnings: records.flatMap((record) =>
            record.value === null
              ? [
                  {
                    code: 'MISSING_OBSERVATION' as const,
                    recordKey: {
                      countryCode: record.countryCode ?? null,
                      indicatorCode: record.indicatorCode ?? null,
                      year: record.year ?? null,
                    },
                    details: { reason: 'null' },
                  },
                ]
              : [],
          ),
        });
      },
    ),
  };
}
