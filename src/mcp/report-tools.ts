import type { McpServer } from '@modelcontextprotocol/server';

import { ReportExecutionService } from '../execution/report-execution.service.js';
import {
  getReportRunInputSchema,
  reportRunPageOutputSchema,
  runReportInputSchema,
} from './mcp.schemas.js';
import { executeMcpTool } from './mcp-tool-result.js';

export function registerReportTools(
  server: McpServer,
  execution: ReportExecutionService,
): void {
  server.registerTool(
    'run_report',
    {
      description:
        'Validate and execute a time-series or period-change report inline.',
      inputSchema: runReportInputSchema,
      outputSchema: reportRunPageOutputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ definition, limit }, context) =>
      executeMcpTool(
        () => execution.run(definition, { limit }, context.mcpReq.signal),
        summarizeRunPage,
        context.mcpReq.signal,
      ),
  );

  server.registerTool(
    'get_report_run',
    {
      description:
        'Get the status and one server-paginated result page of a report run.',
      inputSchema: getReportRunInputSchema,
      outputSchema: reportRunPageOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ runId, cursor, limit }, context) =>
      executeMcpTool(
        async () => execution.getReportRun(runId, { cursor, limit }),
        summarizeRunPage,
        context.mcpReq.signal,
      ),
  );
}

function summarizeRunPage(page: {
  readonly run: { readonly id: string; readonly status: string };
  readonly rows: readonly unknown[];
  readonly nextCursor: string | null;
}): string {
  return `Report run ${page.run.id} is ${page.run.status}; returned ${page.rows.length} row(s)${page.nextCursor === null ? '.' : '; more rows are available.'}`;
}
