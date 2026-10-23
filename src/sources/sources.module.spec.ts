import { Test } from '@nestjs/testing';

import { SourceRegistry } from './source-registry.js';
import { SourcesModule } from './sources.module.js';

describe('SourcesModule', () => {
  it('exports SourceRegistry without exposing adapter selection to consumers', async () => {
    const module = await Test.createTestingModule({
      imports: [SourcesModule],
    }).compile();

    try {
      const registry = module.get(SourceRegistry);

      expect(registry.get('world-bank').sourceId).toBe('world-bank');
    } finally {
      await module.close();
    }
  });
});
