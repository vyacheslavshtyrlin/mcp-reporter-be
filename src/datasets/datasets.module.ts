import { Module } from '@nestjs/common';

import { SourcesModule } from '../sources/sources.module.js';
import { DatasetCatalogService } from './dataset-catalog.service.js';

@Module({
  imports: [SourcesModule],
  providers: [DatasetCatalogService],
  exports: [DatasetCatalogService],
})
export class DatasetsModule {}
