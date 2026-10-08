import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const host = config.get('HOST', { infer: true });
  const port = config.get('PORT', { infer: true });

  await app.listen(port, host);
  Logger.log(`Application is listening on http://${host}:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error('Application failed to start', error, 'Bootstrap');
  process.exitCode = 1;
});
