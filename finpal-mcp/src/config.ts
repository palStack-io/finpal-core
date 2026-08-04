/**
 * Startup configuration.
 *
 * Both variables are required. A missing or malformed one is reported as a
 * sentence naming the variable, because this process is launched by an MCP
 * client that shows the user stderr and nothing else — a stack trace here is
 * indistinguishable from "it is broken".
 */

export class ConfigError extends Error {}

export interface Config {
  url: string;
  token: string;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const rawUrl = (env.FINPAL_URL ?? '').trim();
  const token = (env.FINPAL_TOKEN ?? '').trim();

  if (!rawUrl) {
    throw new ConfigError(
      'FINPAL_URL is not set. Set it to your finPal address, e.g. ' +
      'http://192.168.1.50:8094',
    );
  }
  if (!/^https?:\/\//.test(rawUrl)) {
    throw new ConfigError(
      `FINPAL_URL must start with http:// or https:// (got "${rawUrl}")`,
    );
  }
  if (!token) {
    throw new ConfigError(
      'FINPAL_TOKEN is not set. Mint one in finPal under ' +
      'Settings → Integrations → Agent Access.',
    );
  }
  if (!token.startsWith('fp_live_')) {
    throw new ConfigError(
      'FINPAL_TOKEN does not look like a finPal token — they start with ' +
      '"fp_live_". A session JWT will not work here; mint a personal access ' +
      'token under Settings → Integrations → Agent Access.',
    );
  }

  return { url: rawUrl.replace(/\/+$/, ''), token };
}
