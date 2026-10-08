import { buildWorldBankUrl, WORLD_BANK_ORIGIN } from './world-bank-url.js';

describe('buildWorldBankUrl', () => {
  it('builds a deterministic URL under the fixed World Bank origin', () => {
    const url = buildWorldBankUrl({
      pathSegments: ['country', 'DEU;FIN', 'indicator', 'SP.POP.TOTL'],
      query: {
        source: 2,
        page: undefined,
        format: 'json',
        date: '2020:2021',
      },
    });

    expect(url.origin).toBe(WORLD_BANK_ORIGIN);
    expect(url.pathname).toBe('/v2/country/DEU%3BFIN/indicator/SP.POP.TOTL');
    expect(url.search).toBe('?date=2020%3A2021&format=json&source=2');
  });

  it.each([
    { pathSegments: [] },
    { pathSegments: [''] },
    { pathSegments: ['.'] },
    { pathSegments: ['..'] },
  ])('rejects invalid path segments: $pathSegments', ({ pathSegments }) => {
    expect(() => buildWorldBankUrl({ pathSegments })).toThrow(TypeError);
  });
});
