import { Module } from '@nestjs/common';

import { DatasetsModule } from '../datasets/datasets.module.js';
import { ExecutionModule } from '../execution/execution.module.js';
import { McpController } from './mcp.controller.js';
import { McpServerFactory } from './mcp-server-factory.js';
import { McpHttpHandler } from './mcp-http-handler.js';

@Module({
  imports: [DatasetsModule, ExecutionModule],
  controllers: [McpController],
  providers: [McpServerFactory, McpHttpHandler],
})
export class McpModule {}
