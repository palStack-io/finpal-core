import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('reads the two required variables', () => {
    const cfg = loadConfig({
      FINPAL_URL: 'http://192.168.1.50:8094',
      FINPAL_TOKEN: 'fp_live_abc',
    });
    expect(cfg.url).toBe('http://192.168.1.50:8094');
    expect(cfg.token).toBe('fp_live_abc');
  });

  it('strips a trailing slash so paths do not double up', () => {
    expect(loadConfig({
      FINPAL_URL: 'http://x:8094/', FINPAL_TOKEN: 'fp_live_abc',
    }).url).toBe('http://x:8094');
  });

  it('names the missing variable rather than failing obscurely', () => {
    expect(() => loadConfig({ FINPAL_TOKEN: 'fp_live_abc' }))
      .toThrow(/FINPAL_URL/);
    expect(() => loadConfig({ FINPAL_URL: 'http://x' }))
      .toThrow(/FINPAL_TOKEN/);
  });

  it('rejects a token that is not a finPal token', () => {
    // Pasting a JWT here is the predictable mistake; say so early.
    expect(() => loadConfig({
      FINPAL_URL: 'http://x', FINPAL_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.x.y',
    })).toThrow(/fp_live_/);
  });

  it('rejects a url with no scheme', () => {
    expect(() => loadConfig({
      FINPAL_URL: '192.168.1.50:8094', FINPAL_TOKEN: 'fp_live_abc',
    })).toThrow(/http/);
  });

  it('throws ConfigError, so index.ts can print it without a stack trace', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
  });
});
