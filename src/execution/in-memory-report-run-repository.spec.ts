import {
  recordBatch,
  reportDefinition,
  validatedPlan,
} from '../../test/helpers/report-fixtures.js';
import { calculateTimeSeries } from '../reports/time-series.js';
import { EXECUTION_ERROR_CODE } from './execution.error.js';
import { InMemoryReportRunRepository } from './in-memory-report-run-repository.js';

describe('InMemoryReportRunRepository', () => {
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
});
