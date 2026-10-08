import { Module } from '@nestjs/common';

import type { DataSourceAdapter } from './contracts/index.js';
import { DATA_SOURCE_ADAPTERS } from './sources.tokens.js';
import { WorldBankAdapter } from './world-bank/world-bank-adapter.js';
import { WorldBankCountryCatalog } from './world-bank/world-bank-country.catalog.js';
import { WorldBankDataLoader } from './world-bank/world-bank-data.loader.js';
import { WorldBankHttpClient } from './world-bank/world-bank-http.client.js';
import { WorldBankRetryPolicy } from './world-bank/world-bank-retry.policy.js';

@Module({
  providers: [
    {
      provide: WorldBankHttpClient,
      useFactory: () => new WorldBankHttpClient(),
    },
    {
      provide: WorldBankRetryPolicy,
      useFactory: () => new WorldBankRetryPolicy(),
    },
    {
      provide: WorldBankDataLoader,
      inject: [WorldBankHttpClient, WorldBankRetryPolicy],
      useFactory: (
        client: WorldBankHttpClient,
        retryPolicy: WorldBankRetryPolicy,
      ) => new WorldBankDataLoader(client, { retryPolicy }),
    },
    {
      provide: WorldBankCountryCatalog,
      inject: [WorldBankHttpClient, WorldBankRetryPolicy],
      useFactory: (
        client: WorldBankHttpClient,
        retryPolicy: WorldBankRetryPolicy,
      ) => new WorldBankCountryCatalog(client, retryPolicy),
    },
    WorldBankAdapter,
    {
      provide: DATA_SOURCE_ADAPTERS,
      inject: [WorldBankAdapter],
      useFactory: (
        worldBankAdapter: WorldBankAdapter,
      ): readonly DataSourceAdapter[] => Object.freeze([worldBankAdapter]),
    },
  ],
  exports: [DATA_SOURCE_ADAPTERS],
})
export class SourcesModule {}
