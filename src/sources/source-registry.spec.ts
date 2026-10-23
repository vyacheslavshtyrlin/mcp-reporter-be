import type { DataSourceAdapter } from './contracts/index.js';
import { SOURCE_ERROR_CODE } from './contracts/index.js';
import { SourceRegistry } from './source-registry.js';

function fakeAdapter(sourceId: string): DataSourceAdapter {
  return {
    sourceId,
    listDatasets: async () => [],
    describeDataset: async () => {
      throw new Error('Not implemented by this fake');
    },
    listDimensionValues: async () => ({ items: [], nextCursor: null }),
    listMeasures: async () => ({ items: [], nextCursor: null }),
    fetchRecords: async () => {
      throw new Error('Not implemented by this fake');
    },
  };
}

describe('SourceRegistry', () => {
  it('returns the adapter registered for a source ID', () => {
    const worldBank = fakeAdapter('world-bank');
    const fixture = fakeAdapter('fixture');
    const registry = new SourceRegistry([worldBank, fixture]);

    expect(registry.get('world-bank')).toBe(worldBank);
    expect(registry.get('fixture')).toBe(fixture);
  });

  it('rejects an unknown source with a stable domain error', () => {
    const registry = new SourceRegistry([fakeAdapter('world-bank')]);

    expect(() => registry.get('unknown')).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
        retryable: false,
        context: { sourceId: 'unknown' },
      }),
    );
  });

  it('rejects duplicate source IDs during construction', () => {
    expect(
      () =>
        new SourceRegistry([
          fakeAdapter('world-bank'),
          fakeAdapter('world-bank'),
        ]),
    ).toThrow('Duplicate data source adapter registration: world-bank');
  });
});
