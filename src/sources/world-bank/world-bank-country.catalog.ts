import { z } from 'zod';

import type { DimensionValue } from '../contracts/dataset-schema.js';
import { SOURCE_ERROR_CODE, SourceError } from '../contracts/source.error.js';
import type { WorldBankJsonClient } from './world-bank-data.loader.js';
import { WorldBankRetryPolicy } from './world-bank-retry.policy.js';

const positiveIntegerFromNumberOrString = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()),
]);

const countryPageSchema = z.tuple([
  z.object({
    page: z.number().int().positive(),
    pages: z.number().int().positive(),
    per_page: positiveIntegerFromNumberOrString,
    total: z.number().int().nonnegative(),
  }),
  z.array(
    z.object({
      id: z.string().regex(/^[A-Z0-9]{3}$/),
      name: z.string().min(1),
      region: z.object({
        id: z.string(),
        value: z.string(),
      }),
    }),
  ),
]);

interface CountryPageMetadata {
  readonly page: number;
  readonly pages: number;
  readonly perPage: number;
  readonly total: number;
}

interface CountryPage {
  readonly metadata: CountryPageMetadata;
  readonly countries: readonly (DimensionValue & {
    readonly aggregate: boolean;
  })[];
}

export class WorldBankCountryCatalog {
  constructor(
    private readonly client: WorldBankJsonClient,
    private readonly retryPolicy: WorldBankRetryPolicy,
  ) {}

  async listCountries(signal: AbortSignal): Promise<readonly DimensionValue[]> {
    const allCountries: Array<
      DimensionValue & { readonly aggregate: boolean }
    > = [];
    let firstMetadata: CountryPageMetadata | undefined;

    for (let pageNumber = 1; ; pageNumber += 1) {
      const page = await this.retryPolicy.execute(async () => {
        const payload = await this.client.getJson(
          {
            pathSegments: ['country'],
            query: { format: 'json', page: pageNumber, per_page: 400 },
          },
          signal,
        );

        return parseCountryPage(payload);
      }, signal);

      if (page.metadata.page !== pageNumber) {
        throw invalidCountryPage(
          'World Bank returned an unexpected country page',
          {
            requestedPage: pageNumber,
            returnedPage: page.metadata.page,
          },
        );
      }

      if (firstMetadata === undefined) {
        firstMetadata = page.metadata;
      } else if (
        page.metadata.pages !== firstMetadata.pages ||
        page.metadata.perPage !== firstMetadata.perPage ||
        page.metadata.total !== firstMetadata.total
      ) {
        throw invalidCountryPage(
          'World Bank changed country metadata between pages',
          { page: pageNumber },
        );
      }

      allCountries.push(...page.countries);

      if (pageNumber === firstMetadata.pages) {
        break;
      }
    }

    if (firstMetadata === undefined) {
      throw new Error('World Bank country catalog ended without a page');
    }

    if (allCountries.length !== firstMetadata.total) {
      throw invalidCountryPage(
        'World Bank returned an unexpected country total',
        {
          expectedTotal: firstMetadata.total,
          actualTotal: allCountries.length,
        },
      );
    }

    const uniqueIds = new Set<string>();

    for (const country of allCountries) {
      if (uniqueIds.has(country.value)) {
        throw invalidCountryPage('World Bank returned a duplicate country', {
          countryCode: country.value,
        });
      }

      uniqueIds.add(country.value);
    }

    return allCountries
      .filter((country) => !country.aggregate)
      .map(({ value, label }) => ({ value, label }))
      .toSorted((left, right) => left.label.localeCompare(right.label));
  }
}

function parseCountryPage(payload: unknown): CountryPage {
  const result = countryPageSchema.safeParse(payload);

  if (!result.success) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'World Bank returned an unexpected country page',
      {
        cause: result.error,
        context: {
          sourceId: 'world-bank',
          issueCount: result.error.issues.length,
        },
      },
    );
  }

  const [metadata, countries] = result.data;

  if (metadata.page > metadata.pages || countries.length > metadata.per_page) {
    throw invalidCountryPage(
      'World Bank returned inconsistent country pagination',
      { page: metadata.page },
    );
  }

  return {
    metadata: {
      page: metadata.page,
      pages: metadata.pages,
      perPage: metadata.per_page,
      total: metadata.total,
    },
    countries: countries.map((country) => ({
      value: country.id,
      label: country.name,
      aggregate:
        country.region.id === 'NA' || country.region.value === 'Aggregates',
    })),
  };
}

function invalidCountryPage(
  message: string,
  context: Readonly<Record<string, string | number>>,
): SourceError {
  return new SourceError(SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID, message, {
    context: { sourceId: 'world-bank', ...context },
  });
}
