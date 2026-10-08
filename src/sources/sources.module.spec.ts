import { Test } from '@nestjs/testing';

import type { DataSourceAdapter } from './contracts/index.js';
import { SourcesModule } from './sources.module.js';
import { DATA_SOURCE_ADAPTERS } from './sources.tokens.js';

describe('SourcesModule', () => {
  it('exports a frozen adapter registry through a runtime token', async () => {
    const module = await Test.createTestingModule({
      imports: [SourcesModule],
    }).compile();

    try {
      const adapters =
        module.get<readonly DataSourceAdapter[]>(DATA_SOURCE_ADAPTERS);

      expect(adapters.map((adapter) => adapter.sourceId)).toEqual([
        'world-bank',
      ]);
      expect(Object.isFrozen(adapters)).toBe(true);
    } finally {
      await module.close();
    }
  });
});
