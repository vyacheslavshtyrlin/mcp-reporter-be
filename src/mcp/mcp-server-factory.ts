import { Inject, Injectable } from '@nestjs/common';

import { McpServer } from '@modelcontextprotocol/server';

import { DatasetCatalogService } from '../datasets/dataset-catalog.service.js';
import { ReportExecutionService } from '../execution/report-execution.service.js';
import { registerCatalogTools } from './catalog-tools.js';
import { registerReportTools } from './report-tools.js';

@Injectable()
export class McpServerFactory {
  constructor(
    @Inject(DatasetCatalogService)
    private readonly datasets: DatasetCatalogService,
    @Inject(ReportExecutionService)
    private readonly execution: ReportExecutionService,
  ) {}

  create(): McpServer {
    const server = new McpServer(
      { name: 'mcp-reporter-be', version: '0.1.0' },
      {
        instructions:
          'Discover a dataset and its schema before running a report. Use server cursors unchanged when requesting the next page.',
        maxToolInputElements: 500,
      },
    );

    registerCatalogTools(server, this.datasets);
    registerReportTools(server, this.execution);
    return server;
  }
}
