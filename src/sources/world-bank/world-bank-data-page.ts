import { z } from 'zod';

import { SOURCE_ERROR_CODE, SourceError } from '../contracts/source.error.js';

const positiveIntegerFromNumberOrString = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()),
]);

const metadataSchema = z.object({
  page: z.number().int().positive(),
  pages: z.number().int().positive(),
  per_page: positiveIntegerFromNumberOrString,
  total: z.number().int().nonnegative(),
  sourceid: z.string().min(1).nullable(),
  lastupdated: z.iso.date(),
});

const observationSchema = z.object({
  indicator: z.object({
    id: z.string().min(1),
    value: z.string(),
  }),
  country: z.object({
    id: z.string().min(1),
    value: z.string(),
  }),
  countryiso3code: z.string().regex(/^[A-Z0-9]{3}$/),
  date: z.string().regex(/^\d{4}$/),
  value: z.number().finite().nullable(),
  unit: z.string().optional(),
  obs_status: z.string().optional(),
  decimal: z.number().int().nonnegative(),
  footnote: z.string().nullable().optional(),
});

const dataPageSchema = z.tuple([metadataSchema, z.array(observationSchema)]);

const apiErrorMessageSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
});

const apiErrorSchema = z.tuple([
  z.object({
    message: z.tuple([apiErrorMessageSchema]).rest(apiErrorMessageSchema),
  }),
]);

export interface WorldBankPageMetadata {
  readonly page: number;
  readonly pages: number;
  readonly perPage: number;
  readonly total: number;
  readonly sourceDatasetId: string;
  readonly lastUpdated: string;
}

export type WorldBankRecord = Readonly<{
  sourceId: 'world-bank';
  sourceDatasetId: string;
  countryCode: string;
  indicatorCode: string;
  year: number;
  value: number | null;
  footnote: string | null;
  observationStatus: string | null;
}>;

export interface WorldBankDataPage {
  readonly metadata: WorldBankPageMetadata;
  readonly records: readonly WorldBankRecord[];
}

export function parseWorldBankDataPage(
  payload: unknown,
  expectedSourceDatasetId: string,
): WorldBankDataPage {
  const apiError = apiErrorSchema.safeParse(payload);

  if (apiError.success) {
    const [message] = apiError.data[0].message;

    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'World Bank returned an API error payload',
      {
        context: {
          sourceId: 'world-bank',
          apiErrorId: message.id,
          apiErrorKey: message.key,
        },
      },
    );
  }

  const result = dataPageSchema.safeParse(payload);

  if (!result.success) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'World Bank returned an unexpected data page',
      {
        cause: result.error,
        context: {
          sourceId: 'world-bank',
          issueCount: result.error.issues.length,
        },
      },
    );
  }

  const [metadata, observations] = result.data;

  if (
    metadata.sourceid !== null &&
    metadata.sourceid !== expectedSourceDatasetId
  ) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'World Bank returned data from a different dataset',
      {
        context: {
          sourceId: 'world-bank',
          page: metadata.page,
          expectedSourceDatasetId,
          actualSourceDatasetId: metadata.sourceid,
        },
      },
    );
  }

  if (
    metadata.page > metadata.pages ||
    observations.length > metadata.per_page
  ) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'World Bank returned inconsistent pagination metadata',
      {
        context: {
          sourceId: 'world-bank',
          page: metadata.page,
          pages: metadata.pages,
          perPage: metadata.per_page,
          recordCount: observations.length,
        },
      },
    );
  }

  return {
    metadata: {
      page: metadata.page,
      pages: metadata.pages,
      perPage: metadata.per_page,
      total: metadata.total,
      sourceDatasetId: expectedSourceDatasetId,
      lastUpdated: metadata.lastupdated,
    },
    records: observations.map((observation) => ({
      sourceId: 'world-bank',
      sourceDatasetId: expectedSourceDatasetId,
      countryCode: observation.countryiso3code,
      indicatorCode: observation.indicator.id,
      year: Number(observation.date),
      value: observation.value,
      footnote: normalizeOptionalText(observation.footnote),
      observationStatus: normalizeOptionalText(observation.obs_status),
    })),
  };
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  return value === undefined || value === null || value.trim() === ''
    ? null
    : value;
}
