import {
  isSourceError,
  SOURCE_ERROR_CODE,
  SourceError,
} from './source.error.js';

describe('SourceError', () => {
  it('exposes a stable code, retryability, context and cause', () => {
    const cause = new Error('socket closed');
    const error = new SourceError(
      SOURCE_ERROR_CODE.SOURCE_UNAVAILABLE,
      'World Bank is temporarily unavailable',
      {
        cause,
        retryable: true,
        context: {
          sourceId: 'world-bank',
          statusCode: 503,
        },
      },
    );

    expect(error).toMatchObject({
      name: 'SourceError',
      code: 'SOURCE_UNAVAILABLE',
      retryable: true,
      context: {
        sourceId: 'world-bank',
        statusCode: 503,
      },
      cause,
    });
    expect(Object.isFrozen(error.context)).toBe(true);
    expect(isSourceError(error)).toBe(true);
  });

  it('uses safe defaults and rejects unrelated errors in the type guard', () => {
    const error = new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'Response does not match the source contract',
    );

    expect(error.retryable).toBe(false);
    expect(error.context).toEqual({});
    expect(isSourceError(new Error('unrelated'))).toBe(false);
  });
});
