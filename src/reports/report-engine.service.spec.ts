import { Test } from '@nestjs/testing';

import {
  observation,
  recordBatch,
  validatedPlan,
} from '../../test/helpers/report-fixtures.js';
import { SOURCE_ERROR_CODE } from '../sources/contracts/index.js';
import { ReportDefinitionService } from './report-definition.service.js';
import { ReportEngineService } from './report-engine.service.js';
import { ReportsModule } from './reports.module.js';

describe('ReportsModule', () => {
  it('exports definition and calculation providers', async () => {
    const module = await Test.createTestingModule({
      imports: [ReportsModule],
    }).compile();

    try {
      expect(module.get(ReportDefinitionService)).toBeInstanceOf(
        ReportDefinitionService,
      );
      expect(module.get(ReportEngineService)).toBeInstanceOf(
        ReportEngineService,
      );
    } finally {
      await module.close();
    }
  });
});

describe('ReportEngineService', () => {
  const engine = new ReportEngineService();
  const records = [
    observation('DEU', 'POP', 2020, 100),
    observation('DEU', 'POP', 2022, 150),
  ];

  it.each([
    ['time_series', 'time_series'],
    ['period_change', 'period_change'],
  ] as const)('dispatches %s calculations', (kind, expectedKind) => {
    const plan = validatedPlan(kind, {
      filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      measures: [{ id: 'POP' }],
    });

    expect(engine.calculate(plan, recordBatch(records)).kind).toBe(
      expectedKind,
    );
  });

  it('rejects a batch from another schema or source', () => {
    const plan = validatedPlan('time_series');
    const batch = recordBatch(records, { schemaVersion: 2 });

    expect(() => engine.calculate(plan, batch)).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      }),
    );
  });
});
