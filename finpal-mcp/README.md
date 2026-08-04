# finpal-mcp

An MCP server for [finPal](https://github.com/palStack-io/finpal-core). Point an
LLM at your own finPal instance and ask about your money in plain language —
"what did I spend on groceries in March", "which subscriptions am I paying for",
"am I over budget".

Read-only.

## Before you install: where your data goes

This matters more than the setup instructions, so it comes first.

**If you point this at a hosted model — Claude, ChatGPT — the transactions it
reads are sent to that company.** Not just totals: descriptions, amounts, dates,
account labels, whatever the question touches.

**If you point it at a local model — Ollama, LM Studio, a llama.cpp server —
nothing leaves your hardware.**

Both are legitimate choices. Only one of them is private. If privacy is why you
self-host finPal rather than using a bank aggregator, then this is the decision
where that choice actually gets made, so make it deliberately.

## Setup

**1. Mint a token.** In finPal: **Settings → Integrations → Agent Access**. Pick
the `read` scope. The token is shown once — finPal stores only a hash of it.

That screen also shows the config block below with your URL and token already
filled in, so you can copy it rather than typing it.

**2. Add it to your MCP client.** For Claude Desktop, in
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "finpal": {
      "command": "npx",
      "args": ["-y", "finpal-mcp"],
      "env": {
        "FINPAL_URL": "http://192.168.1.50:8094",
        "FINPAL_TOKEN": "fp_live_..."
      }
    }
  }
}
```

`FINPAL_URL` is where your finPal answers — the same address you use in a browser.
If you reach finPal through a reverse proxy or tunnel, use that external URL.

**3. Restart the client.**

### If finPal runs in Docker and your client is elsewhere

stdio needs the client to spawn this process, which is awkward across a container
boundary. In that case run it as an HTTP server instead:

```bash
FINPAL_URL=http://finpal:8094 FINPAL_TOKEN=fp_live_... \
  FINPAL_MCP_TRANSPORT=http node dist/index.js
```

| Variable | Default | Notes |
|---|---|---|
| `FINPAL_MCP_TRANSPORT` | `stdio` | Set to `http` for the streamable HTTP transport |
| `FINPAL_MCP_PORT` | `8095` | |
| `FINPAL_MCP_HOST` | `127.0.0.1` | Loopback only. See the warning below |

**It binds to loopback for a reason.** This process holds your finPal token, so it
does not ask callers for credentials of their own — anything that can reach the
port can read your finances. Setting `FINPAL_MCP_HOST` to `0.0.0.0` is possible
because bridging container networks sometimes needs it, and it prints a warning
every time. Do it only on a network you trust, and prefer publishing the port to a
specific interface in Docker over binding wide.

Cross-origin requests are refused, so a page in your browser cannot drive the
server.

## Tools

| Tool | What it does |
|---|---|
| `search_transactions` | Search by text, date range, category, account. Returns at most 100 rows plus the total, so the model can tell you when it is seeing a slice |
| `get_spending_summary` | Totals over a date range, grouped by category, merchant or month. Computed by finPal, so the arithmetic is right |
| `list_accounts` | Accounts with balances and types |
| `list_categories` | Your categories, so the model filters by real names instead of guessing |
| `get_budget_status` | Your budget limits |
| `get_net_worth_trend` | Assets, liabilities and net worth over time |
| `get_recurring_transactions` | Saved subscriptions and regular bills |

## Writing

One write tool: **`set_transaction_category`**, which refiles a transaction under
a different category. It needs a `read_write` token; a `read` token gets a clear
refusal.

Every agent write is **recorded in finPal's agent activity log** with the previous
value, so you can undo it in one click from **Settings → Integrations → Agent
Access**. The model cannot approve or undo its own changes — those endpoints are
browser-only by design.

Only one write tool exists on purpose. finPal's guardrails cover more actions —
creating transactions and budgets become proposals awaiting your approval — but
those endpoints are not reachable yet, and a tool that always fails is worse than
one that does not exist: the model keeps trying it and reports the failure as your
problem.

**It cannot delete anything**, and it never will through this server. finPal
refuses deletion to tokens outright: deleting a category silently clears the
category on every transaction that ever used it.

## What it hides from the model

Even with a read token, some things should not reach an LLM, so results are
scrubbed on the way out:

- **Account digits are masked.** `Chase Checking ...4242` becomes
  `Chase Checking ...••••`. The label survives because otherwise the model cannot
  tell you which account it means; the digits do not, because it does not need
  them. The model cannot read an account number back to you — it never saw one.
- **Transaction notes are omitted entirely.** They are free text and people put
  account and routing numbers in them.
- **Email addresses become pseudonyms.** You are `you`; other people in your
  household are `member-1`, `member-2`. Their real names are pseudonymised too.

This is a second line of defence, not the first. The first is the token's `read`
scope, which finPal enforces itself — so a different MCP client could not talk its
way into write access by ignoring these rules.

## Limitations worth knowing

- **A read token can see the whole household**, not only your own rows —
  accounts, categories and budgets are returned for every member of a shared
  instance. If that is not what you want, do not share the token.
- **"Merchant" means the transaction description.** finPal has no separate
  merchant field, so grouping by merchant groups identical descriptions.
- **Budgets are limits, not progress.** `get_budget_status` returns what you
  budgeted; ask for a spending summary over the same period to see how you are
  tracking.
- **Income and transfers are excluded** from spending summaries.

## Troubleshooting

The server writes one line to stderr and exits when something is wrong. Your MCP
client will show it.

| Message | What to do |
|---|---|
| `FINPAL_URL is not set` | Add it to the `env` block |
| `FINPAL_TOKEN does not look like a finPal token` | You have probably pasted a session token from the browser. Mint a personal access token instead |
| `Could not reach finPal at ...` | Check the URL and that finPal is running. From another machine, check it is not bound to localhost only |
| `This finPal token has expired` | Tokens expire — 90 days by default. Mint a new one |
| `This finPal token was revoked` | Mint a new one |
| `finPal did not recognise this token` | The token is from a different instance, or was mistyped |

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

`test/e2e/README.md` documents how to verify a build against a real instance,
which the unit tests cannot do.

## Licence

AGPL-3.0, the same as finPal Core.
