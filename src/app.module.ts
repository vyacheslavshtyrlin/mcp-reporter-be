import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.js';
import { SystemModule } from './system/system.module.js';
import { SourcesModule } from './sources/sources.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SystemModule,
    SourcesModule,
  ],
})
export class AppModule {}
