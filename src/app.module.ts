import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './config/environment.js';
import { DatasetsModule } from './datasets/datasets.module.js';
import { ExecutionModule } from './execution/execution.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SystemModule } from './system/system.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SystemModule,
    DatasetsModule,
    ReportsModule,
    ExecutionModule,
  ],
})
export class AppModule {}
