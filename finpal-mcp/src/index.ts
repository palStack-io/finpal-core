#!/usr/bin/env node
/**
 * stdio MCP server for finPal.
 *
 * Launched by an MCP client, which shows the user stderr and nothing else — so a
 * configuration problem must print a sentence, not a stack trace.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { FinpalClient, FinpalError } from './client.js';
import { type Config, ConfigError, loadConfig } from './config.js';
import type { ScrubContext } from './scrub.js';
import { httpOptionsFromEnv, serveHttp } from './http.js';
import { buildServer } from './server.js';

/**
 * Identity endpoint, which doubles as the startup credential check.
 *
 * `/api/v1/auth/whoami` and not `/api/v1/auth/me`: the latter is the obvious
 * choice and does not work — it sits on the legacy `auth_api` blueprint behind a
 * bare `@jwt_required()`, so a personal access token gets a flat 401. Checking
 * there would make this server refuse to start every time.
 *
 * `whoami` was added to finpal_core for this purpose, because the caller's
 * identity cannot be inferred from the data: `/accounts`, `/categories` and
 * `/budgets` are filtered by `get_all_user_ids()` (every user on the instance,
 * not the member calling), and `/transactions` matches
 * `user_id == caller OR caller in split_with`, so a row can belong to somebody
 * else. Guessing is worse than not knowing — label the wrong household member
 * "you" and the model attributes one person's spending to another with complete
 * confidence.
 */
const WHOAMI_PATH = '/api/v1/auth/whoami';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`finpal-mcp: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const client = new FinpalClient(config.url, config.token);

  // Fail here rather than on every tool call: a token that cannot read anything
  // produces seven identical failures and no clue which layer is at fault.
  let ownerId = '';
  try {
    const me = (await client.get(WHOAMI_PATH)) as { id?: string } | null;
    ownerId = me?.id ?? '';
  } catch (err) {
    const message = err instanceof FinpalError ? err.message : String(err);
    process.stderr.write(`finpal-mcp: could not verify the token — ${message}\n`);
    process.exit(1);
  }

  const ctx: ScrubContext = { ownerId };

  // stdio unless asked otherwise: it is what Claude Desktop and local runners
  // use, and it opens no socket.
  const transport = (process.env.FINPAL_MCP_TRANSPORT ?? 'stdio').trim().toLowerCase();

  if (transport === 'http') {
    const options = httpOptionsFromEnv(process.env, (m) => process.stderr.write(m + '\n'));
    await serveHttp(client, ctx, options, (m) => process.stderr.write(m + '\n'));
    return;
  }

  if (transport !== 'stdio') {
    process.stderr.write(
      `finpal-mcp: FINPAL_MCP_TRANSPORT must be "stdio" or "http" (got "${transport}")\n`,
    );
    process.exit(1);
  }

  await buildServer(client, ctx).connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`finpal-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
