/**
 * Build the MCP server. Transport-agnostic, so stdio and HTTP share one
 * definition of the tools rather than drifting apart.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FinpalError, type FinpalClient } from './client.js';
import type { ScrubContext } from './scrub.js';
import { ALL_TOOLS } from './tools.js';

export function buildServer(client: FinpalClient, ctx: ScrubContext): Server {
  const server = new Server(
    { name: 'finpal', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = ALL_TOOLS.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
    }
    try {
      const result = await tool.run(
        client,
        (request.params.arguments ?? {}) as Record<string, unknown>,
        ctx,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      // FinpalError messages are written for a person to act on; anything else
      // is reported without its internals, which could name a table or a host.
      const text = err instanceof FinpalError
        ? err.message
        : `finPal request failed while running ${tool.name}.`;
      return { isError: true, content: [{ type: 'text', text }] };
    }
  });

  return server;
}
