import { Test } from '@nestjs/testing';

import { DatasetCatalogService } from './dataset-catalog.service.js';
import { DatasetsModule } from './datasets.module.js';

describe('DatasetsModule', () => {
  it('exports a catalog application service wired to registered sources', async () => {
    const module = await Test.createTestingModule({
      imports: [DatasetsModule],
    }).compile();

    try {
      const catalog = module.get(DatasetCatalogService);

      await expect(catalog.listDatasets('world-bank')).resolves.toEqual([
        expect.objectContaining({ sourceId: 'world-bank', datasetId: '2' }),
      ]);
    } finally {
      await module.close();
    }
  });
});
