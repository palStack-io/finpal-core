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
 * Prove the token works before announcing any tools.
 *
 * `/api/v1/accounts` and not `/api/v1/auth/me`: `/auth/me` is the obvious choice
 * and it does not work. It lives on the legacy `auth_api` blueprint behind a bare
 * `@jwt_required()`, so a personal access token gets a flat 401
 * (`authorization_required`) — verified against the app's url_map and with a real
 * minted token. Checking there would make the server refuse to start every time.
 *
 * `/api/v1/accounts` carries `@api_auth_required(scope=SCOPE_READ)`, is the
 * endpoint `list_accounts` already calls, and returns 200 with an empty list on a
 * fresh instance — so it distinguishes "your token is wrong" from "you have no
 * data yet", which is exactly the split a startup check should make.
 */
const TOKEN_CHECK_PATH = '/api/v1/accounts';

/**
 * The scrubber renders the caller's own identity as "you" and everyone else as
 * `member-N`. finpal_core exposes no token-reachable endpoint that says who the
 * caller is: `/auth/me` is JWT-only, `/accounts`, `/categories` and `/budgets`
 * are filtered by `get_all_user_ids()` (every user on the instance, not the
 * household member calling), and `/transactions` and `/recurring` match
 * `user_id == caller OR caller in split_with`, so a row can belong to somebody
 * else. Every available heuristic can therefore name the wrong person.
 *
 * Guessing is worse than not knowing: label the wrong household member "you" and
 * the model attributes one person's spending to another with total confidence.
 * So the owner is left unresolved, `pseudonym()` finds no match for the empty
 * string, and the caller reads as `member-N` alongside everyone else. Less
 * friendly, never wrong. Resolving this properly needs a token-reachable
 * identity endpoint in finpal_core.
 */
const UNKNOWN_OWNER = '';

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
  try {
    await client.get(TOKEN_CHECK_PATH);
  } catch (err) {
    const message = err instanceof FinpalError ? err.message : String(err);
    process.stderr.write(`finpal-mcp: could not verify the token — ${message}\n`);
    process.exit(1);
  }

  const ctx: ScrubContext = { ownerId: UNKNOWN_OWNER };

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
