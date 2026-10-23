import { Test, type TestingModule } from '@nestjs/testing';

import {
  observation,
  recordBatch,
  REPORT_TEST_SCHEMA,
  reportDefinition,
} from '../../test/helpers/report-fixtures.js';
import { ReportDefinitionService } from '../reports/report-definition.service.js';
import type {
  CursorPage,
  DataSourceAdapter,
  DatasetSummary,
  DimensionValue,
  MeasureDefinition,
} from '../sources/contracts/index.js';
import { SOURCE_ERROR_CODE, SourceError } from '../sources/contracts/index.js';
import { DATA_SOURCE_ADAPTERS } from '../sources/sources.tokens.js';
import { DEFAULT_REPORT_DEADLINE_MS } from './execution-deadline.js';
import { EXECUTION_ERROR_CODE } from './execution.error.js';
import { ExecutionModule } from './execution.module.js';
import { ReportExecutionService } from './report-execution.service.js';

describe('ReportExecutionService', () => {
  let module: TestingModule | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    await module?.close();
    module = undefined;
  });

  it('publishes a completed immutable snapshot and paginates its rows', async () => {
    const adapter = fakeAdapter();
    const setup = await createExecutionModule(adapter);
    module = setup.module;
    const { service } = setup;

    const first = await service.run(reportDefinition(), { limit: 2 });

    expect(first.run).toMatchObject({ status: 'completed' });
    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.run).not.toHaveProperty('result.rows');
    expect(first.run).not.toHaveProperty('result.sourceRecords');
    expect(Object.isFrozen(first.run)).toBe(true);
    expect(Object.isFrozen(first.rows[0])).toBe(true);
    expect(vi.mocked(adapter.fetchRecords)).toHaveBeenCalledOnce();
    expect(vi.mocked(adapter.fetchRecords)).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'fixture', datasetId: 'climate' }),
      expect.any(AbortSignal),
    );

    const second = service.getReportRun(first.run.id, {
      cursor: first.nextCursor as string,
      limit: 10,
    });
    expect(second.rows).toHaveLength(10);
    expect(second.nextCursor).toBeNull();
  });

  it('stores a safe failed run without a partial result', async () => {
    const adapter = fakeAdapter({
      fetchRecords: vi
        .fn()
        .mockRejectedValue(
          new SourceError(
            SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
            'Fixture source is unavailable',
            { retryable: true },
          ),
        ),
    });
    ({ module } = await createExecutionModule(adapter));
    const service = module.get(ReportExecutionService);

    const page = await service.run(reportDefinition(), { limit: 10 });

    expect(page).toMatchObject({
      run: {
        status: 'failed',
        error: {
          code: SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
          message: 'Fixture source is unavailable',
          retryable: true,
        },
      },
      rows: [],
      nextCursor: null,
    });
    expect(page.run).not.toHaveProperty('result');
  });

  it('rejects unsupported report semantics before fetching records', async () => {
    const adapter = fakeAdapter();
    ({ module } = await createExecutionModule(adapter));
    const service = module.get(ReportExecutionService);

    const page = await service.run(
      reportDefinition({ measures: [{ id: 'UNKNOWN' }] }),
      { limit: 10 },
    );

    expect(page.run).toMatchObject({
      status: 'failed',
      error: { code: SOURCE_ERROR_CODE.UNKNOWN_MEASURE },
    });
    expect(adapter.fetchRecords).not.toHaveBeenCalled();
  });

  it('returns a typed error for an unknown run', async () => {
    const setup = await createExecutionModule(fakeAdapter());
    module = setup.module;

    expect(() =>
      setup.service.getReportRun('missing', { limit: 10 }),
    ).toThrowError(
      expect.objectContaining({
        code: EXECUTION_ERROR_CODE.REPORT_RUN_NOT_FOUND,
      }),
    );
  });

  it('fails a run at the common deadline and aborts the source request', async () => {
    vi.useFakeTimers();
    const adapter = fakeAdapter({
      fetchRecords: vi.fn<DataSourceAdapter['fetchRecords']>(
        (_query, signal) =>
          new Promise((_, reject) => {
            signal.addEventListener(
              'abort',
              () =>
                reject(
                  new SourceError(
                    SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
                    'Adapter-specific abort error',
                  ),
                ),
              { once: true },
            );
          }),
      ),
    });
    ({ module } = await createExecutionModule(adapter));
    const service = module.get(ReportExecutionService);

    const execution = service.run(reportDefinition(), { limit: 10 });
    await vi.advanceTimersByTimeAsync(DEFAULT_REPORT_DEADLINE_MS);
    const page = await execution;

    expect(page.run).toMatchObject({
      status: 'failed',
      error: { code: EXECUTION_ERROR_CODE.REPORT_DEADLINE_EXCEEDED },
    });
    expect(vi.mocked(adapter.fetchRecords)).toHaveBeenCalledOnce();
    expect(vi.mocked(adapter.fetchRecords).mock.calls[0]?.[1].aborted).toBe(
      true,
    );
  });

  it('does not start record loading when validation exhausts the deadline', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-10-23T10:00:00.000Z');
    vi.setSystemTime(startedAt);
    const adapter = fakeAdapter();
    ({ module } = await createExecutionModule(adapter));
    const service = module.get(ReportExecutionService);
    const definitions = module.get(ReportDefinitionService);
    const validateAndPlan = definitions.validateAndPlan.bind(definitions);
    vi.spyOn(definitions, 'validateAndPlan').mockImplementation(
      (definition, schema) => {
        vi.setSystemTime(startedAt.getTime() + DEFAULT_REPORT_DEADLINE_MS);
        return validateAndPlan(definition, schema);
      },
    );

    const page = await service.run(reportDefinition(), { limit: 10 });

    expect(page.run).toMatchObject({
      status: 'failed',
      error: { code: EXECUTION_ERROR_CODE.REPORT_DEADLINE_EXCEEDED },
    });
    expect(adapter.fetchRecords).not.toHaveBeenCalled();
  });

  it('does not publish a source result that arrives after the deadline', async () => {
    vi.useFakeTimers();
    const adapter = fakeAdapter({
      fetchRecords: vi.fn<DataSourceAdapter['fetchRecords']>(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve(recordBatch([])),
              DEFAULT_REPORT_DEADLINE_MS + 1,
            );
          }),
      ),
    });
    ({ module } = await createExecutionModule(adapter));
    const service = module.get(ReportExecutionService);

    const execution = service.run(reportDefinition(), { limit: 10 });
    await vi.advanceTimersByTimeAsync(DEFAULT_REPORT_DEADLINE_MS + 1);
    const page = await execution;

    expect(page.run).toMatchObject({
      status: 'failed',
      error: { code: EXECUTION_ERROR_CODE.REPORT_DEADLINE_EXCEEDED },
    });
    expect(page.run).not.toHaveProperty('result');
  });

  it('propagates caller cancellation through the same AbortSignal', async () => {
    const controller = new AbortController();
    const adapter = fakeAdapter({
      fetchRecords: vi.fn<DataSourceAdapter['fetchRecords']>(
        (_query, signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      ),
    });
    ({ module } = await createExecutionModule(adapter));
    const service = module.get(ReportExecutionService);

    const execution = service.run(
      reportDefinition(),
      { limit: 10 },
      controller.signal,
    );
    controller.abort(new Error('client disconnected'));
    const page = await execution;

    expect(page.run).toMatchObject({
      status: 'failed',
      error: { code: EXECUTION_ERROR_CODE.REPORT_REQUEST_ABORTED },
    });
  });
});

async function createExecutionModule(adapter: DataSourceAdapter): Promise<{
  readonly module: TestingModule;
  readonly service: ReportExecutionService;
}> {
  const module = await Test.createTestingModule({
    imports: [ExecutionModule],
  })
    .overrideProvider(DATA_SOURCE_ADAPTERS)
    .useValue([adapter])
    .compile();

  return { module, service: module.get(ReportExecutionService) };
}

function fakeAdapter(
  overrides: Partial<DataSourceAdapter> = {},
): DataSourceAdapter {
  return {
    sourceId: 'fixture',
    listDatasets: vi.fn<() => Promise<readonly DatasetSummary[]>>(),
    describeDataset: vi.fn().mockResolvedValue(REPORT_TEST_SCHEMA),
    listDimensionValues: vi.fn<() => Promise<CursorPage<DimensionValue>>>(),
    listMeasures: vi.fn<() => Promise<CursorPage<MeasureDefinition>>>(),
    fetchRecords: vi
      .fn<DataSourceAdapter['fetchRecords']>()
      .mockResolvedValue(
        recordBatch([
          observation('DEU', 'POP', 2020, 100),
          observation('DEU', 'POP', 2021, 110),
          observation('DEU', 'POP', 2022, 120),
          observation('FIN', 'POP', 2020, 200),
          observation('FIN', 'POP', 2021, 210),
          observation('FIN', 'POP', 2022, 220),
        ]),
      ),
    ...overrides,
  };
}
