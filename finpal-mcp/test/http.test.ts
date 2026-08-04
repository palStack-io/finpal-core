import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_HOST, DEFAULT_PORT, httpOptionsFromEnv } from '../src/http.js';

describe('httpOptionsFromEnv', () => {
  it('defaults to loopback', () => {
    // An HTTP transport opens a socket, and this process holds the finPal token
    // — so anything that can reach the port reads the user's finances with no
    // credentials of its own. Loopback by default is the whole safety story.
    const opts = httpOptionsFromEnv({});
    expect(opts.host).toBe(DEFAULT_HOST);
    expect(DEFAULT_HOST).toBe('127.0.0.1');
    expect(opts.port).toBe(DEFAULT_PORT);
  });

  it('honours an explicit port', () => {
    expect(httpOptionsFromEnv({ FINPAL_MCP_PORT: '9123' }).port).toBe(9123);
  });

  it('refuses a port that is not a port', () => {
    for (const bad of ['0', '-1', '70000', 'eight', '']) {
      expect(() => httpOptionsFromEnv({ FINPAL_MCP_PORT: bad })).toThrow(/port number/);
    }
  });

  it('warns loudly when told to listen off loopback', () => {
    const warnings: string[] = [];
    const opts = httpOptionsFromEnv({ FINPAL_MCP_HOST: '0.0.0.0' }, (m) => warnings.push(m));
    expect(opts.host).toBe('0.0.0.0');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/read your finPal data/);
  });

  it('does not warn for loopback spellings', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
      const warnings: string[] = [];
      httpOptionsFromEnv({ FINPAL_MCP_HOST: host }, (m) => warnings.push(m));
      expect(warnings, host).toHaveLength(0);
    }
  });

  it('treats a blank host as unset rather than binding to nothing', () => {
    expect(httpOptionsFromEnv({ FINPAL_MCP_HOST: '   ' }).host).toBe(DEFAULT_HOST);
  });
});

describe('cross-origin protection', () => {
  it('enables DNS rebinding protection, not just the allowlists', () => {
    // The SDK IGNORES allowedOrigins unless enableDnsRebindingProtection is
    // true. Setting the lists alone looks like protection and is none, so assert
    // the flag is present rather than trusting the comment.
    const source = readFileSync(new URL('../src/http.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/enableDnsRebindingProtection:\s*true/);
    expect(source).toMatch(/allowedOrigins:/);
    expect(source).toMatch(/allowedHosts:/);
  });
});
