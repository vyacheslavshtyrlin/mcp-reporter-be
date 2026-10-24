import type { McpServer } from '@modelcontextprotocol/server';

import { DatasetCatalogService } from '../datasets/dataset-catalog.service.js';
import {
  describeDatasetInputSchema,
  describeDatasetOutputSchema,
  listDatasetsInputSchema,
  listDatasetsOutputSchema,
  listDimensionValuesInputSchema,
  listDimensionValuesOutputSchema,
  listMeasuresInputSchema,
  listMeasuresOutputSchema,
} from './mcp.schemas.js';
import { executeMcpTool } from './mcp-tool-result.js';

export function registerCatalogTools(
  server: McpServer,
  datasets: DatasetCatalogService,
): void {
  server.registerTool(
    'list_datasets',
    {
      description: 'List report datasets available from a registered source.',
      inputSchema: listDatasetsInputSchema,
      outputSchema: listDatasetsOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ sourceId, limit }, context) =>
      executeMcpTool(
        async () => {
          const available = await datasets.listDatasets(
            sourceId,
            context.mcpReq.signal,
          );
          return {
            datasets: available.slice(0, limit),
            truncated: available.length > limit,
          };
        },
        (result) =>
          `Found ${result.datasets.length} dataset(s)${result.truncated ? '; result truncated' : ''}.`,
        context.mcpReq.signal,
      ),
  );

  server.registerTool(
    'describe_dataset',
    {
      description:
        'Describe dataset fields, measures, capabilities and schema version.',
      inputSchema: describeDatasetInputSchema,
      outputSchema: describeDatasetOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ sourceId, datasetId }, context) =>
      executeMcpTool(
        async () => ({
          dataset: await datasets.describeDataset(
            sourceId,
            datasetId,
            context.mcpReq.signal,
          ),
        }),
        ({ dataset }) =>
          `Dataset ${dataset.datasetId} schema version ${dataset.version}: ${dataset.fields.length} field(s), ${dataset.measures.length} measure(s).`,
        context.mcpReq.signal,
      ),
  );

  server.registerTool(
    'list_dimension_values',
    {
      description:
        'List or search values of one dataset dimension with server pagination.',
      inputSchema: listDimensionValuesInputSchema,
      outputSchema: listDimensionValuesOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ sourceId, ...request }, context) =>
      executeMcpTool(
        () =>
          datasets.listDimensionValues(
            sourceId,
            request,
            context.mcpReq.signal,
          ),
        (result) =>
          `Returned ${result.items.length} dimension value(s)${result.nextCursor === null ? '.' : '; more values are available.'}`,
        context.mcpReq.signal,
      ),
  );

  server.registerTool(
    'list_measures',
    {
      description:
        'List or search dataset measures and their allowed report operations.',
      inputSchema: listMeasuresInputSchema,
      outputSchema: listMeasuresOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ sourceId, ...request }, context) =>
      executeMcpTool(
        () => datasets.listMeasures(sourceId, request, context.mcpReq.signal),
        (result) =>
          `Returned ${result.items.length} measure(s)${result.nextCursor === null ? '.' : '; more measures are available.'}`,
        context.mcpReq.signal,
      ),
  );
}
