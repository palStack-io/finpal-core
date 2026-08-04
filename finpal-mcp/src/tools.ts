/**
 * The read tools.
 *
 * Shaped around how someone asks about money, not as a mirror of the REST
 * routes: a forty-tool CRUD dump makes the model's tool selection worse and
 * inflates the context on every call.
 *
 * Read-only in this phase. Write tools wait until the guardrails in finpal_core
 * are wired to a live endpoint.
 */
import { scrub, type ScrubContext } from './scrub.js';

/** Enough rows to answer a question, few enough to keep the context small. */
export const MAX_PAGE_SIZE = 100;

export interface ToolClient {
  get(path: string, params?: Record<string, string | number | undefined>): Promise<unknown>;
  put(path: string, body: Record<string, unknown>): Promise<unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  run(
    client: ToolClient,
    args: Record<string, unknown>,
    ctx: ScrubContext,
  ): Promise<unknown>;
}

const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });

export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_transactions',
    description:
      'Search the user\'s transactions by free text, date range, category, ' +
      `account or amount. Returns at most ${MAX_PAGE_SIZE} rows per call along ` +
      'with the total number of matches — if the total is larger, narrow the ' +
      'filters or use get_spending_summary instead of paging through everything.',
    inputSchema: {
      type: 'object',
      properties: {
        search: str('Text to match against the description'),
        start_date: str('Earliest date, ISO format e.g. 2026-03-01'),
        end_date: str('Latest date, ISO format'),
        category_id: int('Restrict to one category (see list_categories)'),
        account_id: int('Restrict to one account (see list_accounts)'),
        per_page: int(`Rows to return, at most ${MAX_PAGE_SIZE}`),
        page: int('Page number, starting at 1'),
      },
    },
    async run(client, args, ctx) {
      const perPage = Math.min(Number(args.per_page) || 50, MAX_PAGE_SIZE);
      const body = await client.get('/api/v1/transactions/', {
        search: args.search as string,
        start_date: args.start_date as string,
        end_date: args.end_date as string,
        category_id: args.category_id as number,
        account_id: args.account_id as number,
        page: (args.page as number) || 1,
        per_page: perPage,
      });
      return scrub(body, ctx);
    },
  },
  {
    name: 'get_spending_summary',
    description:
      'Total spending over a date range, grouped by category, merchant or ' +
      'month. Use this for any "how much did I spend" question rather than ' +
      'adding up transactions yourself — the totals are computed by the ' +
      'server and will be correct. Note "merchant" groups on the transaction ' +
      'description, since finPal has no separate merchant field. Income and ' +
      'transfers are excluded.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: str('Start of the range, ISO format e.g. 2026-03-01'),
        end_date: str('End of the range, inclusive, ISO format'),
        group_by: {
          type: 'string',
          enum: ['category', 'merchant', 'month'],
          description: 'How to group the totals. Defaults to category.',
        },
      },
      required: ['start_date', 'end_date'],
    },
    async run(client, args, ctx) {
      const body = await client.get('/api/v1/analytics/spending-summary', {
        start_date: args.start_date as string,
        end_date: args.end_date as string,
        group_by: (args.group_by as string) || 'category',
      });
      return scrub(body, ctx);
    },
  },
  {
    name: 'list_accounts',
    description:
      'List the user\'s accounts with balances and types. Account labels have ' +
      'any digits masked, so do not repeat account numbers back to the user.',
    inputSchema: { type: 'object', properties: {} },
    async run(client, _args, ctx) {
      return scrub(await client.get('/api/v1/accounts'), ctx);
    },
  },
  {
    name: 'list_categories',
    description:
      'List the user\'s spending categories. Call this before filtering by ' +
      'category so you use real category names and ids rather than guessing.',
    inputSchema: { type: 'object', properties: {} },
    async run(client, _args, ctx) {
      return scrub(await client.get('/api/v1/categories/'), ctx);
    },
  },
  {
    name: 'get_budget_status',
    description:
      'The user\'s budget limits: category, amount and period. This returns the '
      + 'limits ONLY, not how much has been spent against them — the endpoint '
      + 'carries no spent or remaining field. To say whether a budget is over '
      + 'or under, combine it with get_spending_summary for the same period.',
    inputSchema: { type: 'object', properties: {} },
    async run(client, _args, ctx) {
      return scrub(await client.get('/api/v1/budgets/'), ctx);
    },
  },
  {
    name: 'get_net_worth_trend',
    description:
      'Assets, liabilities and net worth over time, for questions about ' +
      'whether the user\'s overall position is improving.',
    inputSchema: { type: 'object', properties: {} },
    async run(client, _args, ctx) {
      return scrub(await client.get('/api/v1/analytics/networth'), ctx);
    },
  },
  {
    name: 'get_recurring_transactions',
    description:
      'The user\'s saved recurring transactions — subscriptions and regular '
      + 'bills. These are entered or confirmed by the user rather than '
      + 'automatically detected, so treat the list as their record, not an '
      + 'exhaustive account of every repeating charge.',
    inputSchema: { type: 'object', properties: {} },
    async run(client, _args, ctx) {
      return scrub(await client.get('/api/v1/recurring/'), ctx);
    },
  },
];

/**
 * Write tools.
 *
 * Deliberately one, not seven. Six other actions appear in finpal_core's
 * AGENT_WRITE_TIERS, but only `update_transaction_category` is wired to a live
 * endpoint — the rest would return 403 `action_not_permitted`, and a tool that
 * always fails is worse than a tool that does not exist, because the model keeps
 * trying it and reports the failure as the user's problem.
 *
 * Requires a `read_write` token. A `read` token gets a 403 from the server, which
 * surfaces as a sentence rather than a crash.
 */
export const WRITE_TOOLS: ToolDefinition[] = [
  {
    name: 'set_transaction_category',
    description:
      'Change which category a transaction is filed under. Applies immediately '
      + 'and is recorded in finPal\'s agent activity log, where the user can undo '
      + 'it in one click. Requires a read_write token — with a read-only token '
      + 'this fails and you should tell the user to mint a read_write one under '
      + 'Settings → Integrations → Agent Access. Use list_categories first so the '
      + 'category_id is real rather than guessed.',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: int('The transaction to recategorise'),
        category_id: int('The category to file it under (see list_categories)'),
      },
      required: ['transaction_id', 'category_id'],
    },
    async run(client, args, ctx) {
      const id = Number(args.transaction_id);
      if (!Number.isInteger(id) || id < 1) {
        throw new Error('transaction_id must be a positive integer');
      }
      const categoryId = Number(args.category_id);
      if (!Number.isInteger(categoryId) || categoryId < 1) {
        throw new Error('category_id must be a positive integer');
      }
      const body = await client.put(`/api/v1/transactions/${id}`, {
        category_id: categoryId,
      });
      return scrub(body, ctx);
    },
  },
];

/** Everything the server exposes. Reads first: the common case. */
export const ALL_TOOLS: ToolDefinition[] = [...TOOLS, ...WRITE_TOOLS];
