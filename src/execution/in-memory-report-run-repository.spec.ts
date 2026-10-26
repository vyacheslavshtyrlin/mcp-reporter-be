import {
  recordBatch,
  reportDefinition,
  validatedPlan,
} from '../../test/helpers/report-fixtures.js';
import { calculateTimeSeries } from '../reports/time-series.js';
import { EXECUTION_ERROR_CODE } from './execution.error.js';
import { InMemoryReportRunRepository } from './in-memory-report-run-repository.js';

describe('InMemoryReportRunRepository', () => {
  const capacity = 100;

  it('enforces queued to running to completed transitions', () => {
    const repository = new InMemoryReportRunRepository();
    const queued = repository.create(reportDefinition());
    const running = repository.claim(queued.id);
    const result = calculateTimeSeries(
      validatedPlan('time_series'),
      recordBatch([]),
    );
    const completed = repository.complete(queued.id, result);

    expect(running.status).toBe('running');
    expect(completed.status).toBe('completed');
    expect(Object.isFrozen(completed.result)).toBe(true);
    expect(() => repository.claim(queued.id)).toThrowError(
      expect.objectContaining({
        code: EXECUTION_ERROR_CODE.INVALID_REPORT_RUN_TRANSITION,
      }),
    );
  });

  it.each([0, 101, 1.5])('rejects invalid page limit %s', (limit) => {
    const repository = new InMemoryReportRunRepository();
    const run = repository.create(reportDefinition());

    expect(() => repository.getPage(run.id, { limit })).toThrowError(
      expect.objectContaining({
        code: EXECUTION_ERROR_CODE.INVALID_REPORT_RUN_PAGE,
      }),
    );
  });

  it('rejects a malformed or cross-run cursor', () => {
    const repository = new InMemoryReportRunRepository();
    const first = repository.create(reportDefinition());
    repository.claim(first.id);
    repository.complete(
      first.id,
      calculateTimeSeries(validatedPlan('time_series'), recordBatch([])),
    );
    const second = repository.create(reportDefinition());
    const cursor = Buffer.from(
      JSON.stringify({ version: 1, runId: second.id, offset: 1 }),
    ).toString('base64url');

    expect(() =>
      repository.getPage(first.id, { cursor, limit: 10 }),
    ).toThrowError(
      expect.objectContaining({
        code: EXECUTION_ERROR_CODE.INVALID_REPORT_RUN_PAGE,
      }),
    );
  });

  it('evicts the oldest terminal run when capacity is reached', () => {
    const repository = new InMemoryReportRunRepository();
    const first = repository.create(reportDefinition());
    repository.claim(first.id);
    repository.fail(first.id, {
      code: EXECUTION_ERROR_CODE.REPORT_EXECUTION_FAILED,
      message: 'Failed for retention test',
      retryable: false,
    });

    for (let index = 1; index < capacity; index += 1) {
      const run = repository.create(reportDefinition());
      repository.claim(run.id);
      repository.fail(run.id, {
        code: EXECUTION_ERROR_CODE.REPORT_EXECUTION_FAILED,
        message: 'Failed for retention test',
        retryable: false,
      });
    }

    const newest = repository.create(reportDefinition());

    expect(() => repository.get(first.id)).toThrowError(
      expect.objectContaining({
        code: EXECUTION_ERROR_CODE.REPORT_RUN_NOT_FOUND,
      }),
    );
    expect(repository.get(newest.id).status).toBe('queued');
  });

  it('rejects a new run when active runs occupy the entire capacity', () => {
    const repository = new InMemoryReportRunRepository();

    for (let index = 0; index < capacity; index += 1) {
      repository.create(reportDefinition());
    }

    expect(() => repository.create(reportDefinition())).toThrowError(
      expect.objectContaining({
        code: 'REPORT_RUN_CAPACITY_EXCEEDED',
        retryable: true,
      }),
    );
  });
});
