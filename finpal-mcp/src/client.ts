/**
 * Thin HTTP client for the finPal REST API.
 *
 * Read-only. The token travels in a header, never in a URL — URLs end up in
 * logs and proxy access records.
 */

export type FinpalErrorCode =
  | 'token_expired'
  | 'token_revoked'
  | 'invalid_token'
  | 'insufficient_scope'
  | 'unreachable'
  | 'http_error';

export class FinpalError extends Error {
  constructor(public readonly code: FinpalErrorCode, message: string) {
    super(message);
    this.name = 'FinpalError';
  }
}

/**
 * finpal_core returns a distinct code for each refusal. Translating them into
 * sentences is the difference between a user fixing their config and a user
 * blaming the model.
 */
const MESSAGES: Record<string, string> = {
  token_expired:
    'Your finPal token has expired. Mint a new one under Settings → ' +
    'Integrations → Agent Access.',
  token_revoked:
    'This finPal token was revoked. Mint a new one under Settings → ' +
    'Integrations → Agent Access.',
  invalid_token:
    'finPal did not recognise this token. Check FINPAL_TOKEN matches a token ' +
    'you minted on this instance.',
  // This client only issues GETs, so a 403 here means the token lacks READ
  // access — not that a write was refused. Telling the user to stop writing
  // would send them looking for a problem that is not there.
  insufficient_scope:
    'This finPal token cannot read that data. Mint one with the read scope ' +
    'under Settings → Integrations → Agent Access.',
};

export class FinpalClient {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  async get(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<unknown> {
    return this.request('GET', path, params);
  }

  /**
   * A write. finpal_core decides what a token may actually change: safe edits
   * apply, riskier ones come back as a 202 proposal awaiting the user's
   * approval, and anything not permitted is a 403. This client does not
   * second-guess that — it forwards the answer.
   */
  async put(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request('PUT', path, {}, body);
  }

  private async request(
    method: 'GET' | 'PUT',
    path: string,
    params: Record<string, string | number | undefined> = {},
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers: {
          'X-API-Key': this.token,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      // Deliberately not including the caught error: its message varies by
      // runtime and says nothing the user can act on.
      throw new FinpalError(
        'unreachable',
        `Could not reach finPal at ${this.baseUrl}. Check FINPAL_URL and that ` +
        'the instance is running.',
      );
    }

    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const code = (parsed as { error?: string } | null)?.error ?? '';
      if (code in MESSAGES) {
        throw new FinpalError(code as FinpalErrorCode, MESSAGES[code]);
      }
      throw new FinpalError(
        'http_error',
        `finPal returned HTTP ${response.status} for ${path}.`,
      );
    }

    return parsed;
  }
}
