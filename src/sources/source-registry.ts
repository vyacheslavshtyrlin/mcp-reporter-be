import { Inject, Injectable } from '@nestjs/common';

import type { DataSourceAdapter } from './contracts/index.js';
import { SOURCE_ERROR_CODE, SourceError } from './contracts/index.js';
import { DATA_SOURCE_ADAPTERS } from './sources.tokens.js';

@Injectable()
export class SourceRegistry {
  private readonly adaptersBySourceId: ReadonlyMap<string, DataSourceAdapter>;

  constructor(
    @Inject(DATA_SOURCE_ADAPTERS)
    adapters: readonly DataSourceAdapter[],
  ) {
    const adaptersBySourceId = new Map<string, DataSourceAdapter>();

    for (const adapter of adapters) {
      if (adaptersBySourceId.has(adapter.sourceId)) {
        throw new Error(
          `Duplicate data source adapter registration: ${adapter.sourceId}`,
        );
      }

      adaptersBySourceId.set(adapter.sourceId, adapter);
    }

    this.adaptersBySourceId = adaptersBySourceId;
  }

  get(sourceId: string): DataSourceAdapter {
    const adapter = this.adaptersBySourceId.get(sourceId);

    if (adapter === undefined) {
      throw new SourceError(
        SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
        'Data source is not registered',
        { context: { sourceId } },
      );
    }

    return adapter;
  }
}
