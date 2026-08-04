/**
 * Streamable HTTP transport.
 *
 * For the case stdio cannot serve: finPal in Docker with the MCP client on the
 * host or another machine, where spawning a process across the container
 * boundary is awkward.
 *
 * This opens a listening socket, which stdio does not — so it is a genuinely
 * larger attack surface and treated accordingly:
 *
 *   - **Binds to 127.0.0.1 by default.** Anything reachable on the network could
 *     otherwise read the user's finances with no authentication of its own,
 *     because the finPal token lives in this process, not in the request.
 *     Overriding the bind address is possible and warned about at startup.
 *   - **Rejects unexpected Origin headers**, so a page in the user's browser
 *     cannot drive the server via a cross-origin request. The SDK does this when
 *     given `allowedOrigins`.
 *   - **No token in the URL, ever** — see client.ts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import type { FinpalClient } from './client.js';
import type { ScrubContext } from './scrub.js';
import { buildServer } from './server.js';

export const DEFAULT_PORT = 8095;
export const DEFAULT_HOST = '127.0.0.1';

export interface HttpOptions {
  port: number;
  host: string;
}

/**
 * Read HTTP options from the environment.
 *
 * A non-loopback host is allowed but warned about: someone bridging a container
 * network genuinely needs it, and silently refusing would send them editing
 * source. Making it loud is the middle path.
 */
export function httpOptionsFromEnv(
  env: Record<string, string | undefined>,
  warn: (message: string) => void = () => {},
): HttpOptions {
  const port = Number(env.FINPAL_MCP_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `FINPAL_MCP_PORT must be a port number between 1 and 65535 (got "${env.FINPAL_MCP_PORT}")`,
    );
  }

  const host = (env.FINPAL_MCP_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    warn(
      `finpal-mcp: listening on ${host}, not loopback. Anything that can reach ` +
      'this port can read your finPal data — this server holds your token, so ' +
      'callers need no credentials of their own. Only do this on a trusted network.',
    );
  }

  return { port, host };
}

export async function serveHttp(
  client: FinpalClient,
  ctx: ScrubContext,
  options: HttpOptions,
  log: (message: string) => void = () => {},
): Promise<void> {
  const server = buildServer(client, ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // A browser page must not be able to drive this. Both keys are required:
    // the SDK ignores allowedOrigins unless enableDnsRebindingProtection is
    // true, so setting the list alone would look like protection and be none.
    enableDnsRebindingProtection: true,
    allowedHosts: [
      `${options.host}:${options.port}`,
      `localhost:${options.port}`,
      `127.0.0.1:${options.port}`,
    ],
    allowedOrigins: [
      `http://${options.host}:${options.port}`,
      `http://localhost:${options.port}`,
      `http://127.0.0.1:${options.port}`,
    ],
  });

  await server.connect(transport);

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    // A body is read by the transport itself; passing undefined lets it parse.
    transport.handleRequest(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      // No detail: this is a network-facing surface and the error could name
      // internals.
      res.end(JSON.stringify({ error: 'Internal error' }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host, () => {
      log(
        `finpal-mcp: listening on http://${options.host}:${options.port} ` +
        '(streamable HTTP)',
      );
      resolve();
    });
  });
}
