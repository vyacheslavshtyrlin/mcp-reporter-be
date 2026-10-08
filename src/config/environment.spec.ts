import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('returns safe local defaults', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
    });
  });

  it('coerces a valid string port', () => {
    expect(validateEnvironment({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('rejects a port outside the TCP range', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow();
  });
});
