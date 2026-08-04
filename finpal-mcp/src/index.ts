#!/usr/bin/env node
/**
 * stdio MCP server for finPal.
 *
 * Launched by an MCP client, which shows the user stderr and nothing else — so a
 * configuration problem must print a sentence, not a stack trace.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FinpalClient, FinpalError } from './client.js';
import { type Config, ConfigError, loadConfig } from './config.js';
import type { ScrubContext } from './scrub.js';
import { TOOLS } from './tools.js';

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

  const server = new Server(
    { name: 'finpal', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({
      name, description, inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
    }
    try {
      const result = await tool.run(
        client, (request.params.arguments ?? {}) as Record<string, unknown>, ctx,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      // FinpalError messages are written for a person to act on; anything else
      // is reported without its internals.
      const text = err instanceof FinpalError
        ? err.message
        : `finPal request failed while running ${tool.name}.`;
      return { isError: true, content: [{ type: 'text', text }] };
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`finpal-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
